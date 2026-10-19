const EnquiryModel = require('../models/enquiryModel');
const AuditLogModel = require('../models/auditLogModel');
const { EMAIL_RE } = require('./organizationController');
const { PHONE_RE } = require('../config/signupOptions');

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

// Validates the public "Request a demo" form. Returns { fields } or { error }.
function readEnquiry(body = {}) {
  const name = clean(body.name);
  const organizationName = clean(body.organizationName);
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = clean(body.phone);
  const message = String(body.message ?? '').trim();
  if (name.length < 2 || name.length > 100) return { error: 'Your name must be between 2 and 100 characters' };
  if (organizationName.length > 150) return { error: 'Organisation name must be at most 150 characters' };
  if (!EMAIL_RE.test(email) || email.length > 150) return { error: 'Enter a valid e-mail address' };
  if (phone && !PHONE_RE.test(phone)) return { error: 'Enter a valid phone number (digits, spaces, +, - and brackets)' };
  if (message.length < 10 || message.length > 3000) return { error: 'Message must be between 10 and 3000 characters' };
  return { fields: { name, organizationName, email, phone, message } };
}

class EnquiryController {
  // Public (rate-limited): stores the enquiry for the platform owner's "Enquiries" page
  static async create(req, res) {
    // Honeypot: a hidden form field people leave empty; bots fill it in
    if (req.body && req.body.website) return res.status(400).json({ error: 'Your message could not be sent' });
    const { fields, error } = readEnquiry(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const id = await EnquiryModel.insert(fields);
      AuditLogModel.insertLog({
        userId: null, organizationId: null, actions: 'CREATE_ENQUIRY',
        descriptions: `Demo request from ${fields.email}${fields.organizationName ? ` (${fields.organizationName})` : ''}`,
      });
      res.status(201).json({ message: 'Thank you. We have received your request and will be in touch soon.', id });
    } catch (err) {
      console.error('Saving an enquiry failed:', err.message);
      res.status(500).json({ error: 'Your message could not be sent. Please e-mail us instead.' });
    }
  }
}

module.exports = EnquiryController;
module.exports.readEnquiry = readEnquiry;
