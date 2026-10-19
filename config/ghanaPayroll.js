// Ghana statutory payroll rules: PAYE income-tax bands (resident individuals, monthly) and
// SSNIT Tier 1 contributions. This is the ONE place to update when GRA or SSNIT change the rates:
// add a new entry with its effective date (keep the old ones, so past periods still compute the
// same way) and update the source comment.
//
// Amounts are in pesewas (1 GHS = 100 pesewas) and rates in basis points (1% = 100 bp), so every
// calculation is whole-number arithmetic with no floating-point rounding errors.
//
// A payroll period uses the newest entry whose effectiveFrom is on or before the first day of
// that month. Periods before the earliest entry cannot be run.

// ---------- PAYE: monthly graduated rates for resident individuals
// band: { upTo: cumulative upper limit in pesewas (null = no limit), rateBp }
const PAYE_TABLES = [
  {
    effectiveFrom: '2026-09-01',
    // Source: GRA, "Amendments – Income Tax Act, 2026 (Act 1178)", effective 1 September 2026,
    // https://gra.gov.gh/news/portfolio/amendments-income-tax-act-2026-act-1178/ and
    // https://gra.gov.gh/domestic-tax/tax-types/paye/ (checked 19 October 2026).
    // First 588 at 0%, next 80 at 5%, next 100 at 10%, next 2,900 at 17.5%, next 16,000 at 25%,
    // next 30,332 at 30%, exceeding 50,000 at 35%.
    label: 'GRA monthly rates, Income Tax (Amendment) Act, 2026 (Act 1178), from 1 September 2026',
    bands: [
      { upTo: 58800, rateBp: 0 },
      { upTo: 66800, rateBp: 500 },
      { upTo: 76800, rateBp: 1000 },
      { upTo: 366800, rateBp: 1750 },
      { upTo: 1966800, rateBp: 2500 },
      { upTo: 5000000, rateBp: 3000 },
      { upTo: null, rateBp: 3500 },
    ],
  },
  {
    effectiveFrom: '2025-01-01',
    // The monthly rates in force from 1 January 2024 until 31 August 2026 (Income Tax Act, 2015
    // (Act 896) as amended by Act 1111). This table is used only for periods before September 2026,
    // from January 2025 (the earliest SSNIT entry below). Source: published 2024/2025 GRA monthly
    // rates as reproduced by payroll references (e.g. Sage "Ghana Tax Summary 2025"), checked
    // 19 October 2026. First 490 at 0%, next 110 at 5%, next 130 at 10%, next 3,166.67 at 17.5%,
    // next 16,000 at 25%, next 30,520 at 30%, exceeding 50,416.67 at 35%.
    label: 'GRA monthly rates, Act 896 as amended by Act 1111 (until 31 August 2026)',
    bands: [
      { upTo: 49000, rateBp: 0 },
      { upTo: 60000, rateBp: 500 },
      { upTo: 73000, rateBp: 1000 },
      { upTo: 389667, rateBp: 1750 },
      { upTo: 1989667, rateBp: 2500 },
      { upTo: 5041667, rateBp: 3000 },
      { upTo: null, rateBp: 3500 },
    ],
  },
];

// ---------- SSNIT Tier 1 (National Pensions Act, 2008 (Act 766)), on basic salary
// Employee 5.5% (deducted from pay, and deductible before PAYE); employer 13% (paid on top, shown
// on the payslip for information). Contributions are on basic salary up to the maximum monthly
// insurable earnings. The minimum insurable earnings (GHS 587.80 for 2026) is not applied
// automatically: it only matters below the national minimum wage.
const SSNIT_RULES = [
  {
    effectiveFrom: '2026-01-01',
    // Source: SSNIT Public Notice, "Maximum and Minimum Insurable Earnings for 2026", 13 January 2026,
    // https://www.ssnit.org.gh/wp-content/uploads/2026/01/Public-Notice-Min-Max-Insurable.pdf
    // (maximum insurable earnings GHS 69,000 a month from 1 January 2026).
    employeeRateBp: 550,
    employerRateBp: 1300,
    maxInsurablePesewas: 6900000,
  },
  {
    effectiveFrom: '2025-01-01',
    // 2025 maximum insurable earnings GHS 61,000 a month (the figure the 2026 notice above replaced).
    employeeRateBp: 550,
    employerRateBp: 1300,
    maxInsurablePesewas: 6100000,
  },
];

module.exports = { PAYE_TABLES, SSNIT_RULES };
