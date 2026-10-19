const bcrypt = require('bcryptjs');
const db = require('../config/db');
const OrganizationModel = require('../models/organizationModel');
const AuditLogModel = require('../models/auditLogModel');
const { passwordProblem } = require('../config/roles');

const pool = db.promise();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validates the public sign-up form. Returns { fields } or { error }.
function readSignup(body = {}) {
  const organizationName = String(body.organizationName ?? '').trim().replace(/\s+/g, ' ');
  const adminName = String(body.adminName ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = body.password == null ? '' : String(body.password);
  if (organizationName.length < 2 || organizationName.length > 150) return { error: 'Organisation name must be between 2 and 150 characters' };
  if (adminName.length < 2 || adminName.length > 100) return { error: 'Your name must be between 2 and 100 characters' };
  if (!EMAIL_RE.test(email) || email.length > 150) return { error: 'Enter a valid work e-mail address' };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  return { fields: { organizationName, adminName, email, password } };
}

// Creates an organisation and its first admin in one transaction. Retries once if two
// organisations with the same name race for the same slug.
async function createOrganisationWithAdmin({ name, status, plan, seatLimit, contactEmail, admin }) {
  for (let attempt = 0; ; attempt += 1) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const org = await OrganizationModel.insert(conn, { name, status, plan, seatLimit, contactEmail });
      const userId = await OrganizationModel.insertUser(org.id, { ...admin, role: 'admin' }, conn);
      await conn.commit();
      return { ...org, userId };
    } catch (err) {
      await conn.rollback();
      if (err.code === 'ER_DUP_ENTRY' && /slug/.test(err.message) && attempt < 2) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}

class OrganizationController {
  // Public: "Register your organisation". Creates a pending organisation and its first admin,
  // who can sign in once the platform owner approves the organisation.
  static async register(req, res) {
    // Honeypot: a hidden form field people leave empty; bots fill it in
    if (req.body && req.body.website) return res.status(400).json({ error: 'Registration could not be completed' });
    const { fields, error } = readSignup(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [fields.email]);
      if (existing.length) return res.status(409).json({ error: 'An account with this e-mail already exists. Sign in instead, or use another address.' });
      const hash = await bcrypt.hash(fields.password, 10);
      const org = await createOrganisationWithAdmin({
        name: fields.organizationName,
        status: 'pending',
        contactEmail: fields.email,
        admin: { username: fields.adminName, email: fields.email, password: hash },
      });
      AuditLogModel.insertLog({
        userId: org.userId, organizationId: org.id, actions: 'REGISTER_ORGANIZATION',
        descriptions: `Organisation ${fields.organizationName} registered by ${fields.email} (awaiting approval)`,
      });
      res.status(201).json({
        message: 'Thank you. Your organisation is registered and waiting for approval. You can sign in once it has been approved.',
        organization: { name: fields.organizationName, slug: org.slug, status: 'pending' },
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this e-mail already exists. Sign in instead, or use another address.' });
      console.error('Organisation sign-up failed:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = OrganizationController;
module.exports.createOrganisationWithAdmin = createOrganisationWithAdmin;
module.exports.EMAIL_RE = EMAIL_RE;
