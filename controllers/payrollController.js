const PayrollModel = require('../models/payrollModel');
const AuditLogModel = require('../models/auditLogModel');
const { employeeProtection, sendDemoProtected } = require('../config/demoAccounts');
const { PAYE_TABLES, SSNIT_RULES } = require('../config/ghanaPayroll');
const { calculatePayslip, isValidPeriod, earliestPeriod, toPesewas, formatPesewas } = require('../services/payrollCalc');
const { renderPayslipPdf, filename, periodLabel } = require('../services/payslipPdf');

const MAX_ITEMS = 20;
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const parseId = (value) => (/^\d{1,10}$/.test(String(value)) ? Number(value) : null);
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const BANK_ACCOUNT_RE = /^[0-9A-Za-z \-]{4,40}$/;
const SSNIT_NUMBER_RE = /^[0-9A-Za-z\-]{5,20}$/;

const isoDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : value);
function dates(row) {
  return { ...row, pay_date: isoDate(row.pay_date) };
}

function audit(req, actions, descriptions) {
  AuditLogModel.insertLog({ userId: req.user.id, organizationId: req.user.organizationId, actions, descriptions }, (err) => {
    if (err) console.error('Failed to insert audit log:', err.message);
  });
}

// Reads [{ name, amount }] lines (amount in GHS, e.g. "450.00"). Returns { items } or { error }.
function readItems(list, what) {
  if (list === undefined || list === null) return { items: [] };
  if (!Array.isArray(list)) return { error: `${what} must be a list` };
  if (list.length > MAX_ITEMS) return { error: `At most ${MAX_ITEMS} ${what.toLowerCase()} lines` };
  const items = [];
  for (const raw of list) {
    const name = clean(raw && raw.name);
    const amount = toPesewas(raw && raw.amount);
    if (!name || name.length > 80) return { error: `Each ${what.toLowerCase()} line needs a name of up to 80 characters` };
    if (amount === null || amount <= 0) return { error: `Enter an amount above 0 for "${name}" (GHS, up to 2 decimal places)` };
    items.push({ name, amount });
  }
  return { items };
}

// Validates the pay details form. Amounts arrive in GHS and are stored in pesewas.
// Returns { setup } or { error }.
function readPaySetup(body = {}) {
  const basic = toPesewas(body.basicSalary);
  if (basic === null) return { error: 'Enter the basic monthly salary in GHS (up to 2 decimal places)' };
  const currency = String(body.currency || 'GHS').trim().toUpperCase();
  // Payslips are calculated with Ghana's PAYE and SSNIT rules, which are in cedis
  if (currency !== 'GHS') return { error: 'Only GHS payroll is supported (Ghana PAYE and SSNIT rules)' };
  const allowances = readItems(body.allowances, 'Allowance');
  if (allowances.error) return { error: allowances.error };
  const deductions = readItems(body.deductions, 'Deduction');
  if (deductions.error) return { error: deductions.error };
  const bankName = clean(body.bankName) || null;
  const bankAccount = clean(body.bankAccount) || null;
  const ssnitNumber = clean(body.ssnitNumber).toUpperCase() || null;
  if (bankName && bankName.length > 100) return { error: 'Bank name must be at most 100 characters' };
  if (bankAccount && !BANK_ACCOUNT_RE.test(bankAccount)) return { error: 'Bank account must be 4 to 40 letters, digits, spaces or hyphens' };
  if (ssnitNumber && !SSNIT_NUMBER_RE.test(ssnitNumber)) return { error: 'SSNIT number must be 5 to 20 letters, digits or hyphens' };
  return { setup: { basic, currency, allowances: allowances.items, deductions: deductions.items, bankName, bankAccount, ssnitNumber } };
}

// The current month in Accra (UTC+0), 'YYYY-MM'
const currentPeriod = () => new Date().toISOString().slice(0, 7);

// Latest period allowed for a run: next month (payroll is often prepared in advance)
function latestPeriod() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 7);
}

function calcFor(setup, period) {
  return calculatePayslip({ period, basic: setup.basic, allowances: setup.allowances, deductions: setup.deductions });
}

function sendError(res, err, what) {
  if (err && err.code === 'NO_TAX_TABLE') return res.status(400).json({ error: err.message });
  console.error(`${what} failed:`, err && err.message);
  return res.status(500).json({ error: 'Server error' });
}

class PayrollController {
  // The Ghana PAYE bands and SSNIT rates in use (for the payroll page's information panel)
  static taxRules(req, res) {
    res.json({ paye: PAYE_TABLES, ssnit: SSNIT_RULES, earliestPeriod: earliestPeriod(), currentPeriod: currentPeriod() });
  }

  // Calculates a payslip from unsaved pay details (live preview in the pay details form)
  static preview(req, res) {
    const period = req.body && req.body.period ? String(req.body.period) : currentPeriod();
    if (!isValidPeriod(period)) return res.status(400).json({ error: 'Period must be YYYY-MM' });
    const { setup, error } = readPaySetup(req.body);
    if (error) return res.status(400).json({ error });
    try {
      res.json(calcFor(setup, period));
    } catch (err) {
      sendError(res, err, 'Payroll preview');
    }
  }

  // Every employee's pay set-up, with this month's calculated net pay
  static async listPayDetails(req, res) {
    try {
      const setups = await PayrollModel.paySetups(req.user.organizationId);
      const period = currentPeriod();
      res.json(setups.map((s) => {
        let calc = null;
        try { calc = calcFor(s, period); } catch (err) { /* no tax table: shown without figures */ }
        return { ...s, gross: calc && calc.gross, net: calc && calc.net, paye: calc && calc.paye, ssnitEmployee: calc && calc.ssnitEmployee };
      }));
    } catch (err) {
      sendError(res, err, 'Listing pay details');
    }
  }

  static async getPayDetails(req, res) {
    const employeeId = parseId(req.params.id);
    if (!employeeId) return res.status(404).json({ error: 'Employee not found' });
    try {
      const setup = await PayrollModel.paySetup(req.user.organizationId, employeeId);
      if (!setup) return res.status(404).json({ error: 'Employee not found' });
      const demo = await employeeProtection(employeeId, req.user.organizationId);
      res.json({ ...setup, demoProtected: demo.protected });
    } catch (err) {
      sendError(res, err, 'Reading pay details');
    }
  }

  static async savePayDetails(req, res) {
    const employeeId = parseId(req.params.id);
    if (!employeeId) return res.status(404).json({ error: 'Employee not found' });
    const { setup, error } = readPaySetup(req.body);
    if (error) return res.status(400).json({ error });
    try {
      // The demo employee's pay backs the public demo login's payslips
      if ((await employeeProtection(employeeId, req.user.organizationId)).protected) return sendDemoProtected(res);
      const before = await PayrollModel.paySetup(req.user.organizationId, employeeId);
      if (!before) return res.status(404).json({ error: 'Employee not found' });
      await PayrollModel.savePaySetup(req.user.organizationId, employeeId, setup, req.user.id);
      const changes = [];
      if (before.basic !== setup.basic) changes.push(`basic GHS ${formatPesewas(before.basic)} -> ${formatPesewas(setup.basic)}`);
      changes.push(`${setup.allowances.length} allowance(s), ${setup.deductions.length} deduction(s)`);
      if ((before.bankName || null) !== setup.bankName || (before.bankAccount || null) !== setup.bankAccount) changes.push('bank details changed');
      audit(req, 'SET_PAY_DETAILS', `Pay details of ${before.name} (${before.employeeNumber}) updated by ${req.user.email}: ${changes.join('; ')}`);
      res.json({ message: 'Pay details saved', payDetails: await PayrollModel.paySetup(req.user.organizationId, employeeId) });
    } catch (err) {
      sendError(res, err, 'Saving pay details');
    }
  }

  // ---------- runs

  static async listRuns(req, res) {
    try {
      const runs = await PayrollModel.runs(req.user.organizationId);
      res.json(runs.map(dates));
    } catch (err) {
      sendError(res, err, 'Listing payroll runs');
    }
  }

  // Creates draft payslips for the month: every employee (default) or only employeeIds. Employees
  // who already have a payslip that month are skipped, as are employees without a salary.
  static async createRun(req, res) {
    const body = req.body || {};
    const period = String(body.period || '');
    const payDate = String(body.payDate || '');
    if (!isValidPeriod(period)) return res.status(400).json({ error: 'Choose the month to pay (YYYY-MM)' });
    if (period < earliestPeriod()) return res.status(400).json({ error: `Payroll can be run from ${periodLabel(earliestPeriod())}` });
    if (period > latestPeriod()) return res.status(400).json({ error: 'Payroll cannot be run more than one month ahead' });
    if (!ISO_DATE_RE.test(payDate) || Number.isNaN(Date.parse(payDate))) return res.status(400).json({ error: 'Enter the pay date (YYYY-MM-DD)' });
    let employeeIds;
    if (body.employeeIds !== undefined && body.employeeIds !== null) {
      if (!Array.isArray(body.employeeIds) || !body.employeeIds.length) return res.status(400).json({ error: 'Select at least one employee' });
      employeeIds = [...new Set(body.employeeIds.map(parseId))];
      if (employeeIds.some((id) => !id)) return res.status(400).json({ error: 'Invalid employee selection' });
    }
    try {
      const setups = await PayrollModel.paySetups(req.user.organizationId, { employeeIds });
      // Another organisation's employee ids are simply not found
      if (employeeIds && setups.length !== employeeIds.length) return res.status(404).json({ error: 'Employee not found' });
      const noSalary = setups.filter((s) => s.basic <= 0);
      const payable = setups.filter((s) => s.basic > 0);
      if (!payable.length) return res.status(400).json({ error: 'No selected employee has a salary set. Add pay details first.' });
      const snapshots = payable.map((s) => ({ ...s, calc: calcFor(s, period) }));
      const { run, created, skipped } = await PayrollModel.createPayslips(req.user.organizationId, { period, payDate, userId: req.user.id, snapshots });
      if (created.length) {
        audit(req, 'RUN_PAYROLL', `Payroll for ${periodLabel(period)} run by ${req.user.email}: ${created.length} draft payslip(s), pay date ${isoDate(run.pay_date)}`);
      }
      res.status(created.length ? 201 : 200).json({
        message: created.length ? `${created.length} draft payslip(s) created for ${periodLabel(period)}` : `Every selected employee already has a payslip for ${periodLabel(period)}`,
        period,
        created: created.length,
        skipped: skipped.length,
        noSalary: noSalary.map((s) => ({ employeeId: s.employeeId, name: s.name })),
      });
    } catch (err) {
      sendError(res, err, 'Running payroll');
    }
  }

  static async getRun(req, res) {
    const period = String(req.params.period);
    if (!isValidPeriod(period)) return res.status(404).json({ error: 'Payroll run not found' });
    try {
      const run = await PayrollModel.run(req.user.organizationId, period);
      if (!run) return res.status(404).json({ error: 'Payroll run not found' });
      res.json({ ...dates(run), payslips: run.payslips.map(dates) });
    } catch (err) {
      sendError(res, err, 'Reading payroll run');
    }
  }

  // Publishes the month's drafts (all, or only payslipIds) so the employees can see them
  static async publish(req, res) {
    const period = String(req.params.period);
    if (!isValidPeriod(period)) return res.status(404).json({ error: 'Payroll run not found' });
    let payslipIds;
    const body = req.body || {};
    if (body.payslipIds !== undefined && body.payslipIds !== null) {
      if (!Array.isArray(body.payslipIds) || !body.payslipIds.length) return res.status(400).json({ error: 'Select at least one payslip' });
      payslipIds = [...new Set(body.payslipIds.map(parseId))];
      if (payslipIds.some((id) => !id)) return res.status(400).json({ error: 'Invalid payslip selection' });
    }
    try {
      const run = await PayrollModel.run(req.user.organizationId, period);
      if (!run) return res.status(404).json({ error: 'Payroll run not found' });
      const published = await PayrollModel.publish(req.user.organizationId, period, { payslipIds, userId: req.user.id });
      if (published) audit(req, 'PUBLISH_PAYSLIPS', `${published} payslip(s) for ${periodLabel(period)} published by ${req.user.email}`);
      res.json({ message: published ? `${published} payslip(s) published` : 'There were no draft payslips to publish', published });
    } catch (err) {
      sendError(res, err, 'Publishing payslips');
    }
  }

  // ---------- payslips (HR/admin)

  static async getPayslip(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Payslip not found' });
    try {
      const payslip = await PayrollModel.payslip(req.user.organizationId, id);
      if (!payslip) return res.status(404).json({ error: 'Payslip not found' });
      res.json(dates(payslip));
    } catch (err) {
      sendError(res, err, 'Reading payslip');
    }
  }

  static async payslipPdf(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Payslip not found' });
    try {
      const payslip = await PayrollModel.payslip(req.user.organizationId, id);
      if (!payslip) return res.status(404).json({ error: 'Payslip not found' });
      sendPdf(res, payslip);
    } catch (err) {
      sendError(res, err, 'Payslip PDF');
    }
  }

  static async deletePayslip(req, res) {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Payslip not found' });
    try {
      const payslip = await PayrollModel.payslip(req.user.organizationId, id);
      if (!payslip) return res.status(404).json({ error: 'Payslip not found' });
      const { outcome } = await PayrollModel.deleteDraft(req.user.organizationId, id);
      if (outcome === 'not_found') return res.status(404).json({ error: 'Payslip not found' });
      if (outcome === 'published') return res.status(409).json({ error: 'A published payslip cannot be deleted' });
      audit(req, 'DELETE_PAYSLIP', `Draft payslip ${payslip.reference} (${payslip.employee_name}, ${periodLabel(payslip.period)}) deleted by ${req.user.email}`);
      res.json({ message: 'Draft payslip deleted' });
    } catch (err) {
      sendError(res, err, 'Deleting payslip');
    }
  }

  // ---------- the signed-in employee's own published payslips

  static async myPayslips(req, res) {
    if (!req.user.organizationId) return res.json([]);
    try {
      const rows = await PayrollModel.myPayslips(req.user.organizationId, req.user.id);
      res.json(rows.map(dates));
    } catch (err) {
      sendError(res, err, 'Listing my payslips');
    }
  }

  static async myPayslip(req, res) {
    const payslip = await PayrollController.loadOwn(req, res);
    if (payslip) res.json(dates(payslip));
  }

  static async myPayslipPdf(req, res) {
    const payslip = await PayrollController.loadOwn(req, res);
    if (payslip) sendPdf(res, payslip);
  }

  // Another employee's payslip, a draft or another organisation's payslip are all "not found"
  static async loadOwn(req, res) {
    const id = parseId(req.params.id);
    if (!id || !req.user.organizationId) { res.status(404).json({ error: 'Payslip not found' }); return null; }
    try {
      const payslip = await PayrollModel.payslip(req.user.organizationId, id, { employeeUserId: req.user.id });
      if (!payslip) { res.status(404).json({ error: 'Payslip not found' }); return null; }
      return payslip;
    } catch (err) {
      sendError(res, err, 'Reading my payslip');
      return null;
    }
  }
}

function sendPdf(res, payslip) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename(payslip)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  renderPayslipPdf(payslip, res);
}

module.exports = PayrollController;
module.exports.readPaySetup = readPaySetup;
