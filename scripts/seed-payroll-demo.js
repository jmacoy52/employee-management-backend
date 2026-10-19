// Demo payroll for the demo organisation (slug 'demo'): pay details for the seeded demo
// employees and published payslips for August 2026 (PAYE bands before Act 1178) and
// September 2026 (Act 1178 bands), so the demo shows both rule sets.
//
// Called by scripts/init-db.js:
//   - with SEED_DEMO=true / --seed (after db/seed.sql), and
//   - on a public demo deployment (DEMO_MODE=true) whose demo organisation exists but has no payroll
//     yet, so an existing demo database gets payslips without re-running the full seed.
// It never runs against a database without the demo organisation, only touches @emplocore.demo
// employee records of that organisation, and is idempotent (existing pay details and months are kept).
const crypto = require('crypto');
const { calculatePayslip } = require('../services/payrollCalc');

// GHS amounts; basic defaults to the employee record's salary
const PLANS = {
  'kwame.mensah@emplocore.demo': { basic: 9500, allowances: [['Transport', 400], ['Housing', 800], ['Lunch', 300]], deductions: [['Staff welfare', 50]], bank: ['GCB Bank', '1021130045678'] },
  'efua.appiah@emplocore.demo': { basic: 7800, allowances: [['Transport', 400], ['Lunch', 300]], deductions: [['Staff welfare', 50]], bank: ['Ecobank Ghana', '1441000273916'] },
  'kofi.asante@emplocore.demo': { basic: 8200, allowances: [['Transport', 400], ['Housing', 600], ['Lunch', 300]], deductions: [['Staff welfare', 50], ['Staff loan repayment', 200]], bank: ['Stanbic Bank Ghana', '9040008812345'] },
  'abena.owusu@emplocore.demo': { basic: 6500, allowances: [['Transport', 300], ['Lunch', 300]], deductions: [['Staff welfare', 50]], bank: ['Fidelity Bank Ghana', '2400651198702'] },
  'akosua.darko@emplocore.demo': { basic: 6000, allowances: [['Transport', 300], ['Lunch', 300], ['Communication', 150]], deductions: [['Staff welfare', 50]], bank: ['CalBank', '1400004417820'] },
  'yaw.ofori@emplocore.demo': { basic: 5800, allowances: [['Transport', 350], ['Lunch', 300], ['Communication', 200]], deductions: [['Staff welfare', 50]], bank: ['GCB Bank', '1021130078214'] },
  'kwabena.osei@emplocore.demo': { basic: 7000, allowances: [['Transport', 400], ['Lunch', 300]], deductions: [['Staff welfare', 50]], bank: ['Ecobank Ghana', '1441000390551'] },
  'esi.quaye@emplocore.demo': { basic: 5200, allowances: [['Transport', 300], ['Lunch', 300]], deductions: [['Staff welfare', 50]], bank: ['Absa Bank Ghana', '0331046602917'] },
};

const MONTHS = [
  { period: '2026-08', payDate: '2026-08-28' },
  { period: '2026-09', payDate: '2026-09-30' },
];

const ghs = (n) => Math.round(n * 100);

function reference(period) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (const b of crypto.randomBytes(6)) code += alphabet[b % alphabet.length];
  return `PS-${period.replace('-', '')}-${code}`;
}

function demoModeOn() {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.DEMO_MODE || '').trim().toLowerCase());
}

// Should init-db seed demo payroll? force = demo data is being seeded anyway.
async function shouldSeedDemoPayroll(conn, { force = false } = {}) {
  if (!force && !demoModeOn()) return false;
  const [[org]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  if (!org) return false;
  if (force) return true;
  const [[{ runs }]] = await conn.query('SELECT COUNT(*) AS runs FROM payroll_runs WHERE organization_id = ?', [org.id]);
  return runs === 0;
}

// conn: a mysql2/promise connection. Returns a short summary.
async function seedDemoPayroll(conn) {
  const [[org]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  if (!org) return { skipped: 'no demo organisation' };
  const [[hr]] = await conn.query("SELECT id FROM users WHERE email = 'hr@emplocore.demo' AND organization_id = ?", [org.id]);
  const hrId = hr ? hr.id : null;
  const [employees] = await conn.query(
    `SELECT e.id, e.FullName, e.email, e.position, e.salary, COALESCE(d.name, NULLIF(e.Department, '')) AS department_name,
            p.employee_id AS has_pay
     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN employee_pay_details p ON p.employee_id = e.id
     WHERE e.organization_id = ? AND e.email LIKE '%@emplocore.demo' ORDER BY e.id`,
    [org.id]
  );
  let payDetails = 0;
  let payslips = 0;
  await conn.beginTransaction();
  try {
    for (const e of employees) {
      const plan = PLANS[String(e.email).toLowerCase()];
      if (!plan || e.has_pay) continue;
      const basic = Number(e.salary) > 0 ? Math.round(Number(e.salary) * 100) : ghs(plan.basic);
      await conn.query(
        `INSERT INTO employee_pay_details (employee_id, organization_id, basic_salary_pesewas, currency, bank_name, bank_account, updated_by)
         VALUES (?, ?, ?, 'GHS', ?, ?, ?)`,
        [e.id, org.id, basic, plan.bank[0], plan.bank[1], hrId]
      );
      const items = [
        ...plan.allowances.map(([name, amount], i) => [org.id, e.id, 'allowance', name, ghs(amount), i]),
        ...plan.deductions.map(([name, amount], i) => [org.id, e.id, 'deduction', name, ghs(amount), i]),
      ];
      await conn.query('INSERT INTO employee_pay_items (organization_id, employee_id, kind, name, amount_pesewas, sort_order) VALUES ?', [items]);
      payDetails += 1;
    }

    const [setups] = await conn.query(
      `SELECT e.id, e.FullName, e.email, e.position, COALESCE(d.name, NULLIF(e.Department, '')) AS department_name,
              p.basic_salary_pesewas, p.currency, p.bank_name, p.bank_account, p.ssnit_number
       FROM employees e JOIN employee_pay_details p ON p.employee_id = e.id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.organization_id = ? AND e.email LIKE '%@emplocore.demo' ORDER BY e.id`,
      [org.id]
    );
    const [items] = setups.length
      ? await conn.query('SELECT employee_id, kind, name, amount_pesewas FROM employee_pay_items WHERE employee_id IN (?) ORDER BY sort_order, id', [setups.map((s) => s.id)])
      : [[]];

    for (const { period, payDate } of MONTHS) {
      const [[existing]] = await conn.query('SELECT id FROM payroll_runs WHERE organization_id = ? AND period = ?', [org.id, period]);
      if (existing) continue;
      const [run] = await conn.query('INSERT INTO payroll_runs (organization_id, period, pay_date, created_by) VALUES (?, ?, ?, ?)', [org.id, period, payDate, hrId]);
      for (const s of setups) {
        const own = items.filter((i) => i.employee_id === s.id);
        const calc = calculatePayslip({
          period,
          basic: Number(s.basic_salary_pesewas),
          allowances: own.filter((i) => i.kind === 'allowance').map((i) => ({ name: i.name, amount: Number(i.amount_pesewas) })),
          deductions: own.filter((i) => i.kind === 'deduction').map((i) => ({ name: i.name, amount: Number(i.amount_pesewas) })),
        });
        await conn.query(
          `INSERT INTO payslips (organization_id, payroll_run_id, employee_id, period, pay_date, status, reference,
             employee_name, employee_number, employee_email, department_name, job_title, bank_name, bank_account, ssnit_number, currency,
             basic_pesewas, allowances_pesewas, gross_pesewas, ssnit_employee_pesewas, taxable_pesewas, paye_pesewas,
             other_deductions_pesewas, net_pesewas, ssnit_employer_pesewas, line_items, created_by, published_at, published_by)
           VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [org.id, run.insertId, s.id, period, payDate, reference(period),
            s.FullName, `EMP-${String(s.id).padStart(4, '0')}`, s.email, s.department_name, s.position, s.bank_name, s.bank_account, s.ssnit_number, s.currency,
            calc.basic, calc.allowancesTotal, calc.gross, calc.ssnitEmployee, calc.taxable, calc.paye,
            calc.deductionsTotal, calc.net, calc.ssnitEmployer,
            JSON.stringify({ allowances: calc.allowances, deductions: calc.deductions, payeBands: calc.payeBands, rules: calc.rules }),
            hrId, `${payDate} 09:00:00`, hrId]
        );
        payslips += 1;
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
  return { payDetails, payslips };
}

module.exports = { seedDemoPayroll, shouldSeedDemoPayroll, PLANS, MONTHS };
