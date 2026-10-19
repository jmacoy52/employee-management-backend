const crypto = require('crypto');
const db = require('../config/db');

const pool = db.promise();

// Every method takes the organisation id (req.user.organizationId) and only reads or changes that
// organisation's rows; another organisation's employee, run or payslip behaves as if it did not exist.
function requireOrg(organizationId) {
  if (!Number.isInteger(organizationId) || organizationId < 1) throw new Error('Organisation scope is required');
  return organizationId;
}

const EMPLOYEE_SQL = `
  SELECT e.id, e.FullName, e.email, e.position, e.salary, e.user_id, e.organization_id,
         COALESCE(d.name, NULLIF(e.Department, '')) AS department_name,
         p.basic_salary_pesewas, p.currency, p.bank_name, p.bank_account, p.ssnit_number, p.updated_at AS pay_updated_at
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN employee_pay_details p ON p.employee_id = e.id`;

// "EMP-0007": the employee number printed on payslips
const employeeNumber = (id) => `EMP-${String(id).padStart(4, '0')}`;

// PS-202609-4K7Q2M (no 0/O/1/I so it reads unambiguously)
function newReference(period) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `PS-${period.replace('-', '')}-${code}`;
}

// Employee pay set-up: an employee without saved pay details uses the employee record's salary
// as basic, with no allowances or deductions.
function toPaySetup(row, items) {
  const own = items.filter((i) => i.employee_id === row.id);
  const basic = row.basic_salary_pesewas !== null && row.basic_salary_pesewas !== undefined
    ? Number(row.basic_salary_pesewas)
    : Math.round(Number(row.salary || 0) * 100);
  return {
    employeeId: row.id,
    employeeNumber: employeeNumber(row.id),
    name: row.FullName,
    email: row.email,
    jobTitle: row.position,
    department: row.department_name,
    userId: row.user_id,
    saved: row.basic_salary_pesewas !== null && row.basic_salary_pesewas !== undefined,
    basic,
    currency: row.currency || 'GHS',
    bankName: row.bank_name || null,
    bankAccount: row.bank_account || null,
    ssnitNumber: row.ssnit_number || null,
    allowances: own.filter((i) => i.kind === 'allowance').map((i) => ({ name: i.name, amount: Number(i.amount_pesewas) })),
    deductions: own.filter((i) => i.kind === 'deduction').map((i) => ({ name: i.name, amount: Number(i.amount_pesewas) })),
    updatedAt: row.pay_updated_at || null,
  };
}

class PayrollModel {
  // Pay set-up of every employee in the organisation (or only the given ids)
  static async paySetups(organizationId, { employeeIds } = {}, conn = pool) {
    const params = [requireOrg(organizationId)];
    let extra = '';
    if (employeeIds) {
      if (!employeeIds.length) return [];
      extra = ' AND e.id IN (?)';
      params.push(employeeIds);
    }
    const [rows] = await conn.query(`${EMPLOYEE_SQL} WHERE e.organization_id = ?${extra} ORDER BY e.FullName, e.id`, params);
    if (!rows.length) return [];
    const [items] = await conn.query(
      'SELECT employee_id, kind, name, amount_pesewas FROM employee_pay_items WHERE organization_id = ? AND employee_id IN (?) ORDER BY sort_order, id',
      [organizationId, rows.map((r) => r.id)]
    );
    return rows.map((r) => toPaySetup(r, items));
  }

  static async paySetup(organizationId, employeeId) {
    const [setup] = await PayrollModel.paySetups(organizationId, { employeeIds: [employeeId] });
    return setup || null;
  }

  // Replaces the employee's pay details and line items in one transaction, and keeps
  // employees.salary equal to the basic salary. Returns false if the employee is not in the organisation.
  static async savePaySetup(organizationId, employeeId, setup, userId) {
    requireOrg(organizationId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[emp]] = await conn.query('SELECT id FROM employees WHERE id = ? AND organization_id = ? FOR UPDATE', [employeeId, organizationId]);
      if (!emp) { await conn.rollback(); return false; }
      await conn.query(
        `INSERT INTO employee_pay_details (employee_id, organization_id, basic_salary_pesewas, currency, bank_name, bank_account, ssnit_number, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE basic_salary_pesewas = VALUES(basic_salary_pesewas), currency = VALUES(currency),
           bank_name = VALUES(bank_name), bank_account = VALUES(bank_account), ssnit_number = VALUES(ssnit_number), updated_by = VALUES(updated_by)`,
        [employeeId, organizationId, setup.basic, setup.currency, setup.bankName, setup.bankAccount, setup.ssnitNumber, userId]
      );
      await conn.query('DELETE FROM employee_pay_items WHERE employee_id = ? AND organization_id = ?', [employeeId, organizationId]);
      const items = [
        ...setup.allowances.map((a, i) => [organizationId, employeeId, 'allowance', a.name, a.amount, i]),
        ...setup.deductions.map((d, i) => [organizationId, employeeId, 'deduction', d.name, d.amount, i]),
      ];
      if (items.length) {
        await conn.query('INSERT INTO employee_pay_items (organization_id, employee_id, kind, name, amount_pesewas, sort_order) VALUES ?', [items]);
      }
      await conn.query('UPDATE employees SET salary = ? WHERE id = ? AND organization_id = ?', [(setup.basic / 100).toFixed(2), employeeId, organizationId]);
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ---------- runs and payslips

  // Every month with payslips, newest first, with totals (pesewas) per status
  static async runs(organizationId) {
    const [rows] = await pool.query(
      `SELECT r.id, r.period, r.pay_date, r.created_at,
              COUNT(s.id) AS payslip_count,
              COALESCE(SUM(s.status = 'draft'), 0) AS draft_count,
              COALESCE(SUM(s.status = 'published'), 0) AS published_count,
              COALESCE(SUM(s.gross_pesewas), 0) AS gross, COALESCE(SUM(s.net_pesewas), 0) AS net,
              COALESCE(SUM(s.paye_pesewas), 0) AS paye, COALESCE(SUM(s.ssnit_employee_pesewas), 0) AS ssnit_employee,
              COALESCE(SUM(s.ssnit_employer_pesewas), 0) AS ssnit_employer
       FROM payroll_runs r LEFT JOIN payslips s ON s.payroll_run_id = r.id
       WHERE r.organization_id = ?
       GROUP BY r.id ORDER BY r.period DESC`,
      [requireOrg(organizationId)]
    );
    return rows.map(numberTotals);
  }

  static async run(organizationId, period) {
    const [[run]] = await pool.query('SELECT * FROM payroll_runs WHERE organization_id = ? AND period = ?', [requireOrg(organizationId), period]);
    if (!run) return null;
    const [payslips] = await pool.query(
      `SELECT ${LIST_COLUMNS} FROM payslips WHERE payroll_run_id = ? AND organization_id = ? ORDER BY employee_name, id`,
      [run.id, organizationId]
    );
    const totals = payslips.reduce((t, p) => {
      for (const k of ['gross_pesewas', 'net_pesewas', 'paye_pesewas', 'ssnit_employee_pesewas', 'ssnit_employer_pesewas', 'other_deductions_pesewas', 'allowances_pesewas', 'basic_pesewas']) t[k] = (t[k] || 0) + Number(p[k]);
      return t;
    }, {});
    return { ...run, payslips, totals };
  }

  // Creates (or reuses) the month's run and inserts one draft payslip per given snapshot, skipping
  // employees who already have a payslip that month. Returns { run, created: [ids], skipped: [employeeIds] }.
  static async createPayslips(organizationId, { period, payDate, userId, snapshots }) {
    requireOrg(organizationId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO payroll_runs (organization_id, period, pay_date, created_by) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pay_date = IF(VALUES(pay_date) IS NULL, pay_date, VALUES(pay_date))`,
        [organizationId, period, payDate, userId]
      );
      const [[run]] = await conn.query('SELECT * FROM payroll_runs WHERE organization_id = ? AND period = ? FOR UPDATE', [organizationId, period]);
      const [existing] = await conn.query('SELECT employee_id FROM payslips WHERE organization_id = ? AND period = ?', [organizationId, period]);
      const have = new Set(existing.map((r) => r.employee_id));
      const created = [];
      const skipped = [];
      for (const snap of snapshots) {
        if (have.has(snap.employeeId)) { skipped.push(snap.employeeId); continue; }
        for (let attempt = 0; ; attempt += 1) {
          try {
            const [result] = await conn.query(
              `INSERT INTO payslips (organization_id, payroll_run_id, employee_id, period, pay_date, status, reference,
                 employee_name, employee_number, employee_email, department_name, job_title, bank_name, bank_account, ssnit_number, currency,
                 basic_pesewas, allowances_pesewas, gross_pesewas, ssnit_employee_pesewas, taxable_pesewas, paye_pesewas,
                 other_deductions_pesewas, net_pesewas, ssnit_employer_pesewas, line_items, created_by)
               VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [organizationId, run.id, snap.employeeId, period, run.pay_date, newReference(period),
                snap.name, snap.employeeNumber, snap.email, snap.department, snap.jobTitle, snap.bankName, snap.bankAccount, snap.ssnitNumber, snap.currency,
                snap.calc.basic, snap.calc.allowancesTotal, snap.calc.gross, snap.calc.ssnitEmployee, snap.calc.taxable, snap.calc.paye,
                snap.calc.deductionsTotal, snap.calc.net, snap.calc.ssnitEmployer,
                JSON.stringify({ allowances: snap.calc.allowances, deductions: snap.calc.deductions, payeBands: snap.calc.payeBands, rules: snap.calc.rules }),
                userId]
            );
            created.push(result.insertId);
            break;
          } catch (err) {
            // A reference collision is astronomically unlikely; try a new one
            if (err.code === 'ER_DUP_ENTRY' && /reference/.test(err.message) && attempt < 3) continue;
            throw err;
          }
        }
      }
      // Draft payslips follow the run's pay date if it changed
      await conn.query("UPDATE payslips SET pay_date = ? WHERE payroll_run_id = ? AND status = 'draft'", [run.pay_date, run.id]);
      await conn.commit();
      return { run, created, skipped };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Publishes the month's drafts (all, or only the given payslip ids). Returns the number published.
  static async publish(organizationId, period, { payslipIds, userId }) {
    const params = [userId, requireOrg(organizationId), period];
    let extra = '';
    if (payslipIds) {
      if (!payslipIds.length) return 0;
      extra = ' AND id IN (?)';
      params.push(payslipIds);
    }
    const [result] = await pool.query(
      `UPDATE payslips SET status = 'published', published_at = CURRENT_TIMESTAMP, published_by = ?
       WHERE organization_id = ? AND period = ? AND status = 'draft'${extra}`,
      params
    );
    return result.affectedRows;
  }

  // Draft payslips can be deleted (e.g. to recreate after a pay change); published ones cannot.
  // Returns 'deleted' | 'not_found' | 'published'. An empty run goes with its last draft.
  static async deleteDraft(organizationId, payslipId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[slip]] = await conn.query('SELECT id, status, payroll_run_id FROM payslips WHERE id = ? AND organization_id = ? FOR UPDATE', [payslipId, requireOrg(organizationId)]);
      if (!slip) { await conn.rollback(); return { outcome: 'not_found' }; }
      if (slip.status !== 'draft') { await conn.rollback(); return { outcome: 'published' }; }
      await conn.query('DELETE FROM payslips WHERE id = ?', [slip.id]);
      await conn.query('DELETE FROM payroll_runs WHERE id = ? AND NOT EXISTS (SELECT 1 FROM payslips WHERE payroll_run_id = ?)', [slip.payroll_run_id, slip.payroll_run_id]);
      await conn.commit();
      return { outcome: 'deleted' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // One payslip in the organisation. employeeUserId: only that employee's PUBLISHED payslips.
  static async payslip(organizationId, payslipId, { employeeUserId } = {}) {
    const params = [payslipId, requireOrg(organizationId)];
    let extra = '';
    if (employeeUserId) {
      extra = " AND s.status = 'published' AND e.user_id = ?";
      params.push(employeeUserId);
    }
    const [[row]] = await pool.query(
      `SELECT s.*, o.name AS organization_name FROM payslips s
       JOIN organizations o ON o.id = s.organization_id
       LEFT JOIN employees e ON e.id = s.employee_id AND e.organization_id = s.organization_id
       WHERE s.id = ? AND s.organization_id = ?${extra}`,
      params
    );
    return row ? withLines(row) : null;
  }

  // The signed-in employee's published payslips (through their linked employee record)
  static async myPayslips(organizationId, userId) {
    const [rows] = await pool.query(
      `SELECT ${LIST_COLUMNS.split(',').map((c) => `s.${c.trim()}`).join(', ')}
       FROM payslips s JOIN employees e ON e.id = s.employee_id AND e.organization_id = s.organization_id
       WHERE s.organization_id = ? AND e.user_id = ? AND s.status = 'published'
       ORDER BY s.period DESC`,
      [requireOrg(organizationId), userId]
    );
    return rows;
  }
}

const LIST_COLUMNS = `id, employee_id, period, pay_date, status, reference, employee_name, employee_number, department_name,
  job_title, currency, basic_pesewas, allowances_pesewas, gross_pesewas, ssnit_employee_pesewas, taxable_pesewas, paye_pesewas,
  other_deductions_pesewas, net_pesewas, ssnit_employer_pesewas, created_at, published_at`;

function numberTotals(row) {
  const out = { ...row };
  for (const k of ['payslip_count', 'draft_count', 'published_count', 'gross', 'net', 'paye', 'ssnit_employee', 'ssnit_employer']) out[k] = Number(row[k]);
  return out;
}

function withLines(row) {
  const { line_items: raw, ...rest } = row;
  const lines = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { ...rest, lines };
}

module.exports = PayrollModel;
module.exports.employeeNumber = employeeNumber;
module.exports.newReference = newReference;
