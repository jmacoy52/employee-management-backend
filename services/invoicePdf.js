// Paid invoice PDF for a subscription payment (pdfkit, Inter, app palette). Built only from the stored payment row.
// No tax lines: EmploCore does not charge VAT on these invoices; add them here if that changes.
const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_DIR = path.join(path.dirname(require.resolve('@fontsource/inter/package.json')), 'files');
const FONTS = {
  regular: path.join(FONT_DIR, 'inter-latin-400-normal.woff'),
  semibold: path.join(FONT_DIR, 'inter-latin-600-normal.woff'),
  bold: path.join(FONT_DIR, 'inter-latin-700-normal.woff'),
};
const C = { primary: '#2453d6', ink: '#0f172a', muted: '#64748b', border: '#e2e8f0', tint: '#eef3ff', success: '#0f9d58' };

const money = (p) => `GHS ${(Number(p || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '-');

function invoiceFilename(p) {
  return `emplocore-invoice-${p.invoice_number || p.id}.pdf`;
}

function renderInvoicePdf(p, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `EmploCore invoice ${p.invoice_number || p.id}`, Author: 'EmploCore' } });
  doc.registerFont('r', FONTS.regular);
  doc.registerFont('s', FONTS.semibold);
  doc.registerFont('b', FONTS.bold);
  doc.pipe(stream);
  const left = 56;
  const width = doc.page.width - 112;

  doc.roundedRect(left, 56, 30, 30, 7).fill('#0f1e3d');
  doc.font('b').fontSize(16).fillColor('#5eead4').text('E', left, 62, { width: 30, align: 'center' });
  doc.font('b').fontSize(16).fillColor(C.ink).text('Emplo', left + 40, 62, { continued: true }).fillColor(C.primary).text('Core');
  doc.font('b').fontSize(22).fillColor(C.ink).text('Invoice', left, 56, { width, align: 'right' });
  doc.font('s').fontSize(10).fillColor(C.success).text('PAID', left, 86, { width, align: 'right' });

  let y = 130;
  const field = (label, value, x, w) => {
    doc.font('r').fontSize(8.5).fillColor(C.muted).text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.4 });
    doc.font('s').fontSize(10.5).fillColor(C.ink).text(value || '-', x, y + 13, { width: w });
  };
  const col = width / 3;
  field('Invoice number', p.invoice_number || String(p.id), left, col);
  field('Date paid', date(p.paid_at || p.created_at), left + col, col);
  field('Payment reference', p.reference, left + col * 2, col);
  y += 52;
  field('Billed to', [p.organization_name, [p.city, p.country].filter(Boolean).join(', '), p.contact_email].filter(Boolean).join('\n'), left, col * 1.5);
  field('Service period', p.period_start ? `${date(p.period_start)} to ${date(p.period_end)}` : '-', left + col * 1.5, col * 1.5);
  y += 78;

  doc.rect(left, y, width, 26).fill(C.primary);
  doc.font('s').fontSize(9.5).fillColor('#ffffff').text('Description', left + 12, y + 8).text('Amount', left, y + 8, { width: width - 12, align: 'right' });
  y += 26;
  doc.font('r').fontSize(10.5).fillColor(C.ink).text(p.description || `${p.plan_name || 'EmploCore'} subscription`, left + 12, y + 10, { width: width - 140 });
  doc.text(money(p.amount_pesewas), left, y + 10, { width: width - 12, align: 'right' });
  y += 40;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(C.border).lineWidth(1).stroke();
  y += 10;
  doc.rect(left + width - 220, y, 220, 34).fill(C.tint);
  doc.font('s').fontSize(11).fillColor(C.ink).text('Total paid', left + width - 208, y + 11);
  doc.font('b').fontSize(12).fillColor(C.primary).text(money(p.amount_pesewas), left, y + 10, { width: width - 12, align: 'right' });
  y += 60;
  doc.font('r').fontSize(9).fillColor(C.muted)
    .text(`Paid${p.channel ? ` by ${String(p.channel).replace(/_/g, ' ')}` : ''} through Paystack. Amounts in Ghana cedis (GHS).`, left, y, { width })
    .moveDown(0.4)
    .text('Questions about this invoice? Use the contact page at emplocore.vercel.app/contact.', { width });
  doc.end();
}

module.exports = { renderInvoicePdf, invoiceFilename };
