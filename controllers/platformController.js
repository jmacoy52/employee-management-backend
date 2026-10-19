const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const OrganizationModel = require('../models/organizationModel');
const AuditLogModel = require('../models/auditLogModel');
const { ANY_ORG, scopeClause } = require('../models/userModel');
const { ROLES, passwordProblem, ownerPasswordProblem } = require('../config/roles');
const { demoMode } = require('../config/demoAccounts');
const { ownerSetupTokenHash } = require('../config/ownerBootstrap');
const { createOrganisationWithAdmin, EMAIL_RE } = require('./organizationController');
const { pagination } = require('../config/pagination');

const pool = db.promise();
const { STATUSES } = OrganizationModel;
const PLAN_RE = /^[a-z0-9][a-z0-9 _-]{0,39}$/i;

// Every owner action is audit-logged, filed under the organisation it concerns
function audit(req, organizationId, actions, descriptions) {
  AuditLogModel.insertLog({ userId: req.user.id, organizationId, actions, descriptions });
}

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function serverError(res, label, err) {
  console.error(`Platform: failed to ${label}:`, err.message);
  return res.status(500).json({ error: `Failed to ${label}` });
}

// While the public demo runs, its organisation cannot be suspended (it would lock every visitor out)
function isProtectedDemoOrg(org) {
  return org.slug === 'demo' && demoMode() !== 'off';
}

// name, plan, seat_limit, contact_email -> { fields } or { error }
function readOrgFields(body = {}, { requireName = true } = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const plan = body.plan == null || body.plan === '' ? 'standard' : String(body.plan).trim();
  const rawSeats = body.seat_limit;
  const seatLimit = rawSeats === null || rawSeats === undefined || rawSeats === '' ? null : Number(rawSeats);
  const contactEmail = body.contact_email ? String(body.contact_email).trim().toLowerCase() : null;
  if ((requireName || name) && (name.length < 2 || name.length > 150)) return { error: 'Organisation name must be between 2 and 150 characters' };
  if (!PLAN_RE.test(plan)) return { error: 'Plan must be up to 40 letters, numbers, spaces, - or _' };
  if (seatLimit !== null && (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 100000)) return { error: 'Seat limit must be a whole number of at least 1, or empty for unlimited' };
  if (contactEmail && (!EMAIL_RE.test(contactEmail) || contactEmail.length > 150)) return { error: 'Contact e-mail is not valid' };
  return { fields: { name, plan, seatLimit, contactEmail } };
}

class PlatformController {
  // ---------- one-time owner bootstrap (public, rate-limited)
  // Works only while no owner exists, with the setup token whose bcrypt hash is configured
  // (OWNER_SETUP_TOKEN_HASH or config/ownerBootstrap.js). 410 Gone once an owner exists.
  static async bootstrapOwner(req, res) {
    const { setupToken, email, name, password } = req.body || {};
    let conn;
    try {
      conn = await pool.getConnection();
      // Serialise concurrent attempts so two requests cannot both create an owner
      const [[lock]] = await conn.query("SELECT GET_LOCK('emplocore_bootstrap_owner', 10) AS ok");
      if (!lock.ok) return res.status(503).json({ error: 'Please try again.' });
      try {
        const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'");
        if (n > 0) return res.status(410).json({ error: 'The platform owner has already been set up. This endpoint is disabled.', code: 'OWNER_EXISTS' });
        const tokenOk = typeof setupToken === 'string' && setupToken.length >= 16 && setupToken.length <= 200
          && (await bcrypt.compare(setupToken, ownerSetupTokenHash()));
        if (!tokenOk) return res.status(403).json({ error: 'Invalid setup token' });
        const cleanEmail = String(email || '').trim().toLowerCase();
        const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
        if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 150) return res.status(400).json({ error: 'A valid email is required' });
        if (cleanName.length < 2 || cleanName.length > 100) return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
        const problem = ownerPasswordProblem(password, cleanEmail);
        if (problem) return res.status(400).json({ error: problem });
        const [taken] = await conn.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
        if (taken.length) return res.status(409).json({ error: 'That e-mail already belongs to an organisation account. Use another address for the owner.' });
        const hash = await bcrypt.hash(String(password), 12);
        const [result] = await conn.query(
          "INSERT INTO users (organization_id, username, email, password, role) VALUES (NULL, ?, ?, ?, 'owner')",
          [cleanName, cleanEmail, hash]
        );
        AuditLogModel.insertLog({ userId: result.insertId, organizationId: null, actions: 'BOOTSTRAP_OWNER', descriptions: `Platform owner ${cleanEmail} created with the one-time bootstrap endpoint` });
        res.status(201).json({ message: 'Platform owner created. Sign in with this e-mail and password.', email: cleanEmail });
      } finally {
        await conn.query("SELECT RELEASE_LOCK('emplocore_bootstrap_owner')");
      }
    } catch (err) {
      serverError(res, 'create the owner', err);
    } finally {
      if (conn) conn.release();
    }
  }

  // ---------- overview
  static async overview(req, res) {
    try {
      res.json(await OrganizationModel.overview());
    } catch (err) {
      serverError(res, 'load the overview', err);
    }
  }

  // ---------- organisations
  static async listOrganizations(req, res) {
    const status = req.query.status && STATUSES.includes(req.query.status) ? req.query.status : undefined;
    const q = String(req.query.q || '').trim().slice(0, 100) || undefined;
    try {
      res.json(await OrganizationModel.list({ status, q, ...pagination(req.query) }));
    } catch (err) {
      serverError(res, 'list organisations', err);
    }
  }

  static async getOrganization(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid organisation id' });
    try {
      const org = await OrganizationModel.findById(id);
      if (!org) return res.status(404).json({ error: 'Organisation not found' });
      res.json({ ...org, users: await OrganizationModel.users(id) });
    } catch (err) {
      serverError(res, 'load the organisation', err);
    }
  }

  // Body: { name, plan, seat_limit, contact_email, status ('active' default | 'pending'),
  //         admin: { name, email, password? } }. Without a password a temporary one is generated,
  // returned once, and must be changed at first sign-in.
  static async createOrganization(req, res) {
    const { fields, error } = readOrgFields(req.body);
    if (error) return res.status(400).json({ error });
    const status = req.body.status === 'pending' ? 'pending' : 'active';
    const admin = req.body.admin || {};
    const adminName = String(admin.name || '').trim().replace(/\s+/g, ' ');
    const adminEmail = String(admin.email || '').trim().toLowerCase();
    if (adminName.length < 2 || adminName.length > 100) return res.status(400).json({ error: "Admin name must be between 2 and 100 characters" });
    if (!EMAIL_RE.test(adminEmail) || adminEmail.length > 150) return res.status(400).json({ error: 'A valid admin e-mail is required' });
    const supplied = admin.password ? String(admin.password) : null;
    const password = supplied || `Tmp-${crypto.randomBytes(6).toString('base64url')}9`;
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    try {
      const [taken] = await pool.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
      if (taken.length) return res.status(409).json({ error: 'An account with that admin e-mail already exists' });
      const org = await createOrganisationWithAdmin({
        name: fields.name, status, plan: fields.plan, seatLimit: fields.seatLimit,
        contactEmail: fields.contactEmail || adminEmail,
        admin: { username: adminName, email: adminEmail, password: await bcrypt.hash(password, 10), mustChangePassword: !supplied },
      });
      audit(req, org.id, 'CREATE_ORGANIZATION', `Organisation ${fields.name} (${status}) created with admin ${adminEmail} by ${req.user.email}`);
      res.status(201).json({ message: 'Organisation created', id: org.id, slug: org.slug, adminUserId: org.userId, ...(supplied ? {} : { temporaryPassword: password }) });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with that admin e-mail already exists' });
      serverError(res, 'create the organisation', err);
    }
  }

  static async updateOrganization(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid organisation id' });
    const { fields, error } = readOrgFields(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const before = await OrganizationModel.findById(id);
      if (!before) return res.status(404).json({ error: 'Organisation not found' });
      await OrganizationModel.update(id, fields);
      const changes = [];
      if (before.name !== fields.name) changes.push(`name "${before.name}" -> "${fields.name}"`);
      if (before.plan !== fields.plan) changes.push(`plan ${before.plan} -> ${fields.plan}`);
      if (before.seat_limit !== fields.seatLimit) changes.push(`seat limit ${before.seat_limit ?? 'unlimited'} -> ${fields.seatLimit ?? 'unlimited'}`);
      if ((before.contact_email || null) !== fields.contactEmail) changes.push('contact e-mail');
      audit(req, id, 'UPDATE_ORGANIZATION', `Organisation ${fields.name} updated by ${req.user.email}${changes.length ? `: ${changes.join(', ')}` : ''}`);
      res.json({ message: 'Organisation updated' });
    } catch (err) {
      serverError(res, 'update the organisation', err);
    }
  }

  // approve (pending -> active), suspend (-> suspended), reactivate (suspended -> active)
  static statusAction(action) {
    const rules = {
      approve: { from: ['pending'], to: 'active', log: 'APPROVE_ORGANIZATION', done: 'approved' },
      suspend: { from: ['pending', 'active'], to: 'suspended', log: 'SUSPEND_ORGANIZATION', done: 'suspended' },
      reactivate: { from: ['suspended'], to: 'active', log: 'REACTIVATE_ORGANIZATION', done: 'reactivated' },
    }[action];
    return async (req, res) => {
      const id = toId(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid organisation id' });
      try {
        const org = await OrganizationModel.findById(id);
        if (!org) return res.status(404).json({ error: 'Organisation not found' });
        if (action === 'suspend' && isProtectedDemoOrg(org)) {
          return res.status(403).json({ error: 'The public demo organisation cannot be suspended while demo mode is on.', code: 'DEMO_ORGANISATION_PROTECTED' });
        }
        if (!rules.from.includes(org.status)) {
          return res.status(409).json({ error: `This organisation is ${org.status}; it cannot be ${rules.done}.` });
        }
        await OrganizationModel.setStatus(id, rules.to);
        audit(req, id, rules.log, `Organisation ${org.name} ${rules.done} by ${req.user.email}`);
        res.json({ message: `Organisation ${rules.done}`, status: rules.to });
      } catch (err) {
        serverError(res, `${action} the organisation`, err);
      }
    };
  }

  // Only an organisation without users and employees can be deleted (409 otherwise)
  static async deleteOrganization(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid organisation id' });
    try {
      const org = await OrganizationModel.findById(id);
      if (!org) return res.status(404).json({ error: 'Organisation not found' });
      const outcome = await OrganizationModel.deleteIfEmpty(id);
      if (outcome === 'in_use') return res.status(409).json({ error: 'This organisation still has user accounts or employee records. Suspend it instead.' });
      if (outcome === 'not_found') return res.status(404).json({ error: 'Organisation not found' });
      audit(req, null, 'DELETE_ORGANIZATION', `Organisation ${org.name} (${org.slug}, id ${id}) deleted by ${req.user.email}`);
      res.json({ message: 'Organisation deleted' });
    } catch (err) {
      serverError(res, 'delete the organisation', err);
    }
  }

  // ---------- users across organisations (never owners)
  // ?q= (name/e-mail) &organization_id= &role= &status=active|inactive
  static async listUsers(req, res) {
    const scope = scopeClause(ANY_ORG, 'u.organization_id');
    const where = [scope.sql];
    const params = [...scope.params];
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      where.push('(u.username LIKE ? OR u.email LIKE ?)');
      params.push(like, like);
    }
    const orgId = toId(req.query.organization_id);
    if (orgId) { where.push('u.organization_id = ?'); params.push(orgId); }
    if (ROLES.includes(req.query.role)) { where.push('u.role = ?'); params.push(req.query.role); }
    if (req.query.status === 'active') where.push('u.is_active = 1');
    if (req.query.status === 'inactive') where.push('u.is_active = 0');
    const { limit, offset } = pagination(req.query);
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.username, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
                u.organization_id, o.name AS organization_name, o.status AS organization_status
         FROM users u JOIN organizations o ON o.id = u.organization_id
         WHERE ${where.join(' AND ')}
         ORDER BY o.name, u.id LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      res.json(rows);
    } catch (err) {
      serverError(res, 'list users', err);
    }
  }

  // ---------- platform audit log: ?organization_id=<id>|platform &action=
  static async auditLogs(req, res) {
    const raw = req.query.organization_id;
    const organizationId = raw === 'platform' ? 'platform' : toId(raw) || undefined;
    const action = /^[A-Z_]{2,60}$/.test(String(req.query.action || '')) ? req.query.action : undefined;
    try {
      res.json(await AuditLogModel.listPlatform({ organizationId, action, ...pagination({ limit: 300, ...req.query }) }));
    } catch (err) {
      serverError(res, 'load the audit log', err);
    }
  }
}

module.exports = PlatformController;
