// Ghana payslip calculation (services/payrollCalc.js, config/ghanaPayroll.js). No database needed.
// Every expected figure below is worked by hand in the comment above it (amounts in GHS; the
// functions work in pesewas, so GHS 1.00 = 100).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculatePayslip, payeFor, percentOf, ruleFor, earliestPeriod, isValidPeriod, toPesewas, formatPesewas } = require('../services/payrollCalc');
const { PAYE_TABLES, SSNIT_RULES } = require('../config/ghanaPayroll');

const g = (ghs) => Math.round(ghs * 100);
const items = (...pairs) => pairs.map(([name, amount]) => ({ name, amount: g(amount) }));

test('worked example (Act 1178 bands, September 2026): basic 9,500 + allowances 1,500, welfare 50', () => {
  // gross            = 9,500 + 400 + 800 + 300                     = 11,000.00
  // employee SSNIT   = 5.5% x 9,500                                 =    522.50
  // taxable          = 11,000 - 522.50                              = 10,477.50
  // PAYE             = 588 x 0% + 80 x 5% + 100 x 10% + 2,900 x 17.5% + (10,477.50 - 3,668) x 25%
  //                  = 0 + 4.00 + 10.00 + 507.50 + 1,702.375          =  2,223.875 -> 2,223.88
  // net              = 11,000 - 522.50 - 2,223.88 - 50               =  8,203.62
  // employer SSNIT   = 13% x 9,500                                  =  1,235.00 (information only)
  const r = calculatePayslip({ period: '2026-09', basic: g(9500), allowances: items(['Transport', 400], ['Housing', 800], ['Lunch', 300]), deductions: items(['Staff welfare', 50]) });
  assert.equal(r.gross, g(11000));
  assert.equal(r.allowancesTotal, g(1500));
  assert.equal(r.ssnitEmployee, g(522.5));
  assert.equal(r.taxable, g(10477.5));
  assert.equal(r.paye, g(2223.88));
  assert.equal(r.deductionsTotal, g(50));
  assert.equal(r.totalDeductions, g(522.5 + 2223.88 + 50));
  assert.equal(r.net, g(8203.62));
  assert.equal(r.ssnitEmployer, g(1235));
  assert.deepEqual(r.payeBands.map((b) => b.tax), [0, 400, 1000, 50750, 170238]);
  assert.equal(r.rules.payeEffectiveFrom, '2026-09-01');
});

test('income below the tax-free band pays SSNIT but no PAYE', () => {
  // basic 500: SSNIT 27.50; taxable 472.50 <= 588 -> PAYE 0; net 472.50
  const r = calculatePayslip({ period: '2026-10', basic: g(500) });
  assert.deepEqual([r.ssnitEmployee, r.taxable, r.paye, r.net, r.ssnitEmployer], [g(27.5), g(472.5), 0, g(472.5), g(65)]);
});

test('band edges of the Act 1178 table', () => {
  const table = ruleFor(PAYE_TABLES, '2026-09');
  assert.equal(payeFor(g(588), table).paye, 0); // all in the 0% band
  assert.equal(payeFor(g(668), table).paye, g(4)); // + 80 x 5%
  assert.equal(payeFor(g(768), table).paye, g(14)); // + 100 x 10%
  assert.equal(payeFor(g(3668), table).paye, g(521.5)); // + 2,900 x 17.5% = 507.50
  assert.equal(payeFor(g(19668), table).paye, g(4521.5)); // + 16,000 x 25% = 4,000
  assert.equal(payeFor(g(50000), table).paye, g(13621.1)); // + 30,332 x 30% = 9,099.60
  assert.equal(payeFor(g(60000), table).paye, g(17121.1)); // + 10,000 x 35% = 3,500
  assert.deepEqual(payeFor(0, table), { paye: 0, bands: [] });
});

test('high earner: SSNIT is capped at the 2026 maximum insurable earnings (GHS 69,000)', () => {
  // basic 100,000: insurable 69,000 -> employee SSNIT 3,795.00, employer 8,970.00
  // taxable = 96,205; PAYE = 13,621.10 (to 50,000) + 46,205 x 35% (16,171.75) = 29,792.85
  // net = 100,000 - 3,795 - 29,792.85 = 66,412.15
  const r = calculatePayslip({ period: '2026-10', basic: g(100000) });
  assert.deepEqual([r.ssnitEmployee, r.ssnitEmployer, r.taxable, r.paye, r.net], [g(3795), g(8970), g(96205), g(29792.85), g(66412.15)]);
  // 2025: maximum insurable GHS 61,000 -> 5.5% = 3,355.00
  assert.equal(calculatePayslip({ period: '2025-06', basic: g(65000) }).ssnitEmployee, g(3355));
});

test('the bands follow the period: August 2026 uses the old table, September 2026 the Act 1178 table', () => {
  // basic 9,500, nothing else: SSNIT 522.50, taxable 8,977.50
  // August (old): 490 x 0% + 110 x 5% + 130 x 10% + 3,166.67 x 17.5% + (8,977.50 - 3,896.67) x 25%
  //             = 0 + 5.50 + 13.00 + 554.16725 + 1,270.2075 = 1,842.87475 -> 1,842.87; net 7,134.63
  // September (new): 4.00 + 10.00 + 507.50 + (8,977.50 - 3,668) x 25% (1,327.375) = 1,848.875 -> 1,848.88; net 7,128.62
  const aug = calculatePayslip({ period: '2026-08', basic: g(9500) });
  const sep = calculatePayslip({ period: '2026-09', basic: g(9500) });
  assert.deepEqual([aug.taxable, aug.paye, aug.net], [g(8977.5), g(1842.87), g(7134.63)]);
  assert.deepEqual([sep.taxable, sep.paye, sep.net], [g(8977.5), g(1848.88), g(7128.62)]);
  assert.match(aug.rules.payeTable, /Act 1111/);
  assert.match(sep.rules.payeTable, /Act 1178/);
});

test('allowances are taxed but not subject to SSNIT; other deductions come off after tax', () => {
  // basic 3,000, allowance 1,000: SSNIT 165 (on basic only); taxable 3,835
  // PAYE = 4 + 10 + 507.50 + (3,835 - 3,668) x 25% (41.75) = 563.25; net = 4,000 - 165 - 563.25 - 200 = 3,071.75
  const r = calculatePayslip({ period: '2026-10', basic: g(3000), allowances: items(['Housing', 1000]), deductions: items(['Loan', 200]) });
  assert.deepEqual([r.ssnitEmployee, r.taxable, r.paye, r.net], [g(165), g(3835), g(563.25), g(3071.75)]);
});

test('rounding is half up to the nearest pesewa, once', () => {
  assert.equal(percentOf(1, 5000), 1); // 0.5 pesewa -> 1
  assert.equal(percentOf(1, 4999), 0);
  assert.equal(percentOf(g(9500), 550), g(522.5));
  // SSNIT on 1,234.57 = 67.90135 -> 67.90
  assert.equal(calculatePayslip({ period: '2026-10', basic: 123457 }).ssnitEmployee, 6790);
});

test('invalid input and periods without a tax table are rejected', () => {
  assert.throws(() => calculatePayslip({ period: '2026-13', basic: 100 }), /YYYY-MM/);
  assert.throws(() => calculatePayslip({ period: '2026-09', basic: 10.5 }), /whole pesewas/);
  assert.throws(() => calculatePayslip({ period: '2026-09', basic: -1 }), /whole pesewas/);
  assert.throws(() => calculatePayslip({ period: '2026-09', basic: 100, allowances: [{ name: 'x', amount: '5' }] }), /whole pesewas/);
  assert.throws(() => calculatePayslip({ period: '2024-12', basic: 100 }), (err) => err.code === 'NO_TAX_TABLE' && /earliest supported period is 2025-01/.test(err.message));
  assert.equal(earliestPeriod(), '2025-01');
  assert.ok(isValidPeriod('2026-01') && !isValidPeriod('2026-1') && !isValidPeriod(202601));
});

test('GHS amounts are parsed to pesewas and formatted back', () => {
  assert.equal(toPesewas('1,234.56'), 123456);
  assert.equal(toPesewas('12.5'), 1250);
  assert.equal(toPesewas(9500), 950000);
  assert.equal(toPesewas(' 0 '), 0);
  for (const bad of ['12.345', '-5', 'abc', '', null, undefined, '1e5', '10000000000']) assert.equal(toPesewas(bad), null, String(bad));
  assert.equal(formatPesewas(123456), '1,234.56');
  assert.equal(formatPesewas(5), '0.05');
  assert.equal(formatPesewas(-150), '-1.50');
  assert.equal(formatPesewas(100000000), '1,000,000.00');
});

test('the rate config is well formed', () => {
  for (const t of [...PAYE_TABLES]) {
    assert.match(t.effectiveFrom, /^\d{4}-\d{2}-01$/);
    assert.equal(t.bands[t.bands.length - 1].upTo, null);
    const limits = t.bands.slice(0, -1).map((b) => b.upTo);
    assert.deepEqual(limits, [...limits].sort((a, b) => a - b));
    for (const b of t.bands) assert.ok(Number.isInteger(b.rateBp));
  }
  for (const s of SSNIT_RULES) assert.deepEqual([s.employeeRateBp, s.employerRateBp], [550, 1300]);
});
