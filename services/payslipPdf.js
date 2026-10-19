// Server-side payslip PDF (pdfkit). The PDF is built from the stored payslip snapshot only, so a
// download always matches what was published. Inter is embedded (from @fontsource/inter) to match
// the web app; colours follow the app palette.
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatPesewas } = require('./payrollCalc');

const FONT_DIR = path.join(path.dirname(require.resolve('@fontsource/inter/package.json')), 'files');
const FONTS = {
  regular: path.join(FONT_DIR, 'inter-latin-400-normal.woff'),
  semibold: path.join(FONT_DIR, 'inter-latin-600-normal.woff'),
  bold: path.join(FONT_DIR, 'inter-latin-700-normal.woff'),
};

const COLOURS = {
  primary: '#2453d6',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  soft: '#f1f5f9',
  tint: '#eef3ff',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2026-09' -> 'September 2026'
function periodLabel(period) {
  const [y, m] = String(period).split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

// Date | '2026-09-30' -> '30 September 2026'
function dateLabel(value) {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

// Only the last four digits of a bank account are printed
function maskAccount(account) {
  if (!account) return null;
  const digits = String(account).replace(/\s+/g, '');
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

const pct = (bp) => `${(bp / 100).toFixed(bp % 100 ? (bp % 10 ? 2 : 1) : 0)}%`;

function filename(payslip) {
  return `payslip-${payslip.period}-${payslip.reference}.pdf`;
}

// Writes the payslip PDF to the given stream (an Express response)
function renderPayslipPdf(payslip, stream) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: `Payslip ${periodLabel(payslip.period)} – ${payslip.employee_name}`,
      Author: payslip.organization_name,
      Subject: `Payslip ${payslip.reference}`,
      Creator: 'EmploCore',
    },
  });
  doc.registerFont('Inter', FONTS.regular);
  doc.registerFont('Inter-SemiBold', FONTS.semibold);
  doc.registerFont('Inter-Bold', FONTS.bold);
  doc.pipe(stream);

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const right = left + width;
  const cur = payslip.currency || 'GHS';
  const lines = payslip.lines || {};
  const money = (p) => formatPesewas(Number(p));

  // ---------- header band
  doc.rect(0, 0, doc.page.width, 6).fill(COLOURS.primary);
  let y = 40;
  doc.font('Inter-Bold').fontSize(18).fillColor(COLOURS.ink).text(payslip.organization_name, left, y, { width: width * 0.62 });
  doc.font('Inter-SemiBold').fontSize(20).fillColor(COLOURS.primary).text('Payslip', left, y, { width, align: 'right' });
  doc.font('Inter').fontSize(10).fillColor(COLOURS.muted).text(periodLabel(payslip.period), left, y + 26, { width, align: 'right' });
  y = Math.max(doc.y, y + 44) + 14;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(COLOURS.border).stroke();
  y += 16;

  // ---------- details: two columns of label / value
  const details = [
    [['Employee', payslip.employee_name], ['Employee ID', payslip.employee_number], ['Department', payslip.department_name || '—'], ['Job title', payslip.job_title || '—']],
    [['Pay period', periodLabel(payslip.period)], ['Pay date', dateLabel(payslip.pay_date)], ['Reference', payslip.reference],
      ...(payslip.bank_name || payslip.bank_account ? [['Paid to', [payslip.bank_name, maskAccount(payslip.bank_account)].filter(Boolean).join(' ')]] : []),
      ...(payslip.ssnit_number ? [['SSNIT number', payslip.ssnit_number]] : [])],
  ];
  const colW = width / 2;
  let maxY = y;
  details.forEach((col, i) => {
    let cy = y;
    for (const [label, value] of col) {
      doc.font('Inter').fontSize(8.5).fillColor(COLOURS.muted).text(label.toUpperCase(), left + i * colW, cy, { width: colW - 12, characterSpacing: 0.4 });
      doc.font('Inter-SemiBold').fontSize(10.5).fillColor(COLOURS.ink).text(value, left + i * colW, cy + 11, { width: colW - 12 });
      cy = doc.y + 8;
    }
    maxY = Math.max(maxY, cy);
  });
  y = maxY + 10;

  // ---------- earnings and deductions tables, side by side
  const gap = 18;
  const tableW = (width - gap) / 2;
  const earnings = [['Basic salary', payslip.basic_pesewas], ...(lines.allowances || []).map((a) => [a.name, a.amount])];
  const rules = lines.rules || {};
  const deductions = [
    [`SSNIT (employee ${pct(rules.ssnitEmployeeRateBp || 550)})`, payslip.ssnit_employee_pesewas],
    ['Income tax (PAYE)', payslip.paye_pesewas],
    ...(lines.deductions || []).map((d) => [d.name, d.amount]),
  ];
  const totalDeductions = Number(payslip.ssnit_employee_pesewas) + Number(payslip.paye_pesewas) + Number(payslip.other_deductions_pesewas);

  function table(x, title, rows, totalLabel, total) {
    let ty = y;
    doc.roundedRect(x, ty, tableW, 24, 4).fill(COLOURS.soft);
    doc.font('Inter-SemiBold').fontSize(10).fillColor(COLOURS.ink).text(title, x + 10, ty + 7, { width: tableW - 20 });
    doc.font('Inter-SemiBold').fontSize(8.5).fillColor(COLOURS.muted).text(cur, x + 10, ty + 8, { width: tableW - 20, align: 'right' });
    ty += 30;
    for (const [label, amount] of rows) {
      doc.font('Inter').fontSize(10).fillColor(COLOURS.ink).text(label, x + 10, ty, { width: tableW - 110 });
      const rowEnd = doc.y;
      doc.text(money(amount), x + tableW - 110, ty, { width: 100, align: 'right' });
      ty = Math.max(rowEnd, doc.y) + 5;
      doc.moveTo(x + 10, ty - 2).lineTo(x + tableW - 10, ty - 2).lineWidth(0.5).strokeColor(COLOURS.border).stroke();
      ty += 3;
    }
    doc.font('Inter-SemiBold').fontSize(10).fillColor(COLOURS.ink).text(totalLabel, x + 10, ty + 2, { width: tableW - 110 });
    doc.text(money(total), x + tableW - 110, ty + 2, { width: 100, align: 'right' });
    return doc.y + 4;
  }
  const endA = table(left, 'Earnings', earnings, 'Gross pay', payslip.gross_pesewas);
  const endB = table(left + tableW + gap, 'Deductions', deductions, 'Total deductions', totalDeductions);
  y = Math.max(endA, endB) + 18;

  // ---------- net pay
  doc.roundedRect(left, y, width, 52, 6).fill(COLOURS.tint);
  doc.rect(left, y, 4, 52).fill(COLOURS.primary);
  doc.font('Inter-SemiBold').fontSize(11).fillColor(COLOURS.ink).text('Net pay', left + 18, y + 19);
  doc.font('Inter-Bold').fontSize(18).fillColor(COLOURS.primary).text(`${cur} ${money(payslip.net_pesewas)}`, left, y + 15, { width: width - 18, align: 'right' });
  y += 72;

  // ---------- tax summary and employer contribution (information)
  doc.font('Inter-SemiBold').fontSize(9.5).fillColor(COLOURS.ink).text('Tax summary', left, y);
  y = doc.y + 4;
  const summary = [
    ['Gross pay', payslip.gross_pesewas],
    ['Less employee SSNIT', payslip.ssnit_employee_pesewas],
    ['Taxable income', payslip.taxable_pesewas],
    ['PAYE', payslip.paye_pesewas],
    [`Employer SSNIT (${pct(rules.ssnitEmployerRateBp || 1300)}, paid by the employer, not deducted)`, payslip.ssnit_employer_pesewas],
  ];
  for (const [label, amount] of summary) {
    doc.font('Inter').fontSize(9).fillColor(COLOURS.muted).text(label, left, y, { width: width - 120 });
    const end = doc.y;
    doc.text(`${cur} ${money(amount)}`, right - 120, y, { width: 120, align: 'right' });
    y = Math.max(end, doc.y) + 3;
  }
  if (rules.payeTable) {
    y += 6;
    doc.font('Inter').fontSize(8).fillColor(COLOURS.muted).text(`PAYE: ${rules.payeTable}. SSNIT Tier 1 on basic salary.`, left, y, { width });
  }

  // ---------- footer
  const footY = doc.page.height - doc.page.margins.bottom - 24;
  doc.moveTo(left, footY).lineTo(right, footY).lineWidth(0.5).strokeColor(COLOURS.border).stroke();
  doc.font('Inter').fontSize(8).fillColor(COLOURS.muted)
    .text(`${payslip.reference} · Generated by EmploCore for ${payslip.organization_name}. This payslip is confidential.`, left, footY + 8, { width, align: 'center', lineBreak: false });

  doc.end();
}

module.exports = { renderPayslipPdf, filename, periodLabel, dateLabel, maskAccount };
