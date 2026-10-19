// Ghana payslip calculation, in whole pesewas (see config/ghanaPayroll.js for the rates).
//   gross            = basic + allowances
//   employee SSNIT   = 5.5% of basic (basic capped at the maximum insurable earnings)
//   taxable (chargeable) income = gross - employee SSNIT
//   PAYE             = graduated monthly bands on the taxable income
//   net              = gross - employee SSNIT - PAYE - other deductions
//   employer SSNIT   = 13% of basic (capped the same way); information only, not deducted
// Percentages are rounded once, to the nearest pesewa (half up).
const { PAYE_TABLES, SSNIT_RULES } = require('../config/ghanaPayroll');

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// a * rateBp / 10000, rounded half up to a whole pesewa (a >= 0, integers only)
function percentOf(amount, rateBp) {
  return Math.floor((amount * rateBp + 5000) / 10000);
}

// Newest entry in effect on the first day of the period ('YYYY-MM'); null if none.
function ruleFor(list, period) {
  const start = `${period}-01`;
  return [...list].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)).find((r) => r.effectiveFrom <= start) || null;
}

function isValidPeriod(period) {
  return typeof period === 'string' && PERIOD_RE.test(period);
}

// PAYE on a monthly taxable income, with the slice taxed in each band.
function payeFor(taxable, table) {
  let lower = 0;
  let numerator = 0; // sum of slice * rateBp: rounded once at the end
  const bands = [];
  for (const band of table.bands) {
    const upper = band.upTo === null ? Infinity : band.upTo;
    const slice = Math.max(0, Math.min(taxable, upper) - lower);
    if (slice > 0) {
      numerator += slice * band.rateBp;
      bands.push({ from: lower, upTo: band.upTo, rateBp: band.rateBp, slice, tax: percentOf(slice, band.rateBp) });
    }
    if (taxable <= upper) break;
    lower = upper;
  }
  return { paye: Math.floor((numerator + 5000) / 10000), bands };
}

const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

// input: { period: 'YYYY-MM', basic, allowances: [{ name, amount }], deductions: [{ name, amount }] }
// (all amounts in pesewas, whole numbers >= 0). Throws if no tax table covers the period.
function calculatePayslip({ period, basic, allowances = [], deductions = [] }) {
  if (!isValidPeriod(period)) throw new Error('Period must be YYYY-MM');
  for (const n of [basic, ...allowances.map((a) => a.amount), ...deductions.map((d) => d.amount)]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Amounts must be whole pesewas, 0 or more');
  }
  const table = ruleFor(PAYE_TABLES, period);
  const ssnit = ruleFor(SSNIT_RULES, period);
  if (!table || !ssnit) {
    const err = new Error(`No Ghana tax table covers ${period}. The earliest supported period is ${earliestPeriod()}.`);
    err.code = 'NO_TAX_TABLE';
    throw err;
  }
  const allowancesTotal = sum(allowances);
  const deductionsTotal = sum(deductions);
  const gross = basic + allowancesTotal;
  const insurable = Math.min(basic, ssnit.maxInsurablePesewas);
  const ssnitEmployee = percentOf(insurable, ssnit.employeeRateBp);
  const ssnitEmployer = percentOf(insurable, ssnit.employerRateBp);
  const taxable = gross - ssnitEmployee;
  const { paye, bands } = payeFor(taxable, table);
  const net = gross - ssnitEmployee - paye - deductionsTotal;
  return {
    period,
    basic,
    allowances,
    allowancesTotal,
    gross,
    ssnitEmployee,
    taxable,
    paye,
    payeBands: bands,
    deductions,
    deductionsTotal,
    totalDeductions: ssnitEmployee + paye + deductionsTotal,
    net,
    ssnitEmployer,
    rules: {
      payeTable: table.label,
      payeEffectiveFrom: table.effectiveFrom,
      ssnitEffectiveFrom: ssnit.effectiveFrom,
      ssnitEmployeeRateBp: ssnit.employeeRateBp,
      ssnitEmployerRateBp: ssnit.employerRateBp,
      maxInsurable: ssnit.maxInsurablePesewas,
    },
  };
}

// The first period every rule set covers ('YYYY-MM')
function earliestPeriod() {
  const firstPaye = PAYE_TABLES.map((t) => t.effectiveFrom).sort()[0];
  const firstSsnit = SSNIT_RULES.map((t) => t.effectiveFrom).sort()[0];
  return (firstPaye > firstSsnit ? firstPaye : firstSsnit).slice(0, 7);
}

// "1234.56" | "1,234.56" | 1234.56 -> 123456 pesewas; null if not a valid amount (max 2 decimals)
function toPesewas(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim().replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

// 123456 -> "1,234.56"
function formatPesewas(pesewas) {
  const sign = pesewas < 0 ? '-' : '';
  const abs = Math.abs(pesewas);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

module.exports = { calculatePayslip, payeFor, percentOf, ruleFor, isValidPeriod, earliestPeriod, toPesewas, formatPesewas, PERIOD_RE };
