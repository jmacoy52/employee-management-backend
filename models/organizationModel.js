const db = require('../config/db');
const { slugify, uniqueSlug } = require('../config/slug');

// Organisations (tenants), migration 005. Promise-based raw SQL through the shared mysql2 pool.
const pool = db.promise();

const STATUSES = ['pending', 'active', 'suspended', 'rejected'];

class SeatLimitError extends Error {
  constructor(limit) {
    super(`Your organisation has reached its limit of ${limit} active user account${limit === 1 ? '' : 's'}. Deactivate an account or ask EmploCore to raise the limit.`);
    this.code = 'SEAT_LIMIT_REACHED';
    this.status = 409;
  }
}

const COUNTS_SQL = `
  (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count,
  (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id AND u.is_active = 1) AS active_user_count,
  (SELECT COUNT(*) FROM employees e WHERE e.organization_id = o.id) AS employee_count,
  (SELECT COUNT(*) FROM departments d WHERE d.organization_id = o.id) AS department_count`;

class OrganizationModel {
  static async findById(id, conn = pool) {
    const [rows] = await conn.query(`SELECT o.*, ${COUNTS_SQL} FROM organizations o WHERE o.id = ?`, [id]);
    return rows[0] || null;
  }

  // Inserts an organisation. Use inside a transaction together with its first admin.
  // details (optional, from the public sign-up form): { orgType, sizeRange, country, city, phone, contactName }
  static async insert(conn, { name, status = 'pending', plan = 'standard', seatLimit = null, contactEmail = null, details = {} }) {
    const slug = await uniqueSlug(conn, name);
    const d = details || {};
    const [result] = await conn.query(
      `INSERT INTO organizations (name, slug, status, plan, seat_limit, contact_email,
         org_type, size_range, country, city, phone, contact_name, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'active' ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
      [name, slug, status, plan, seatLimit, contactEmail,
        d.orgType || null, d.sizeRange || null, d.country || null, d.city || null, d.phone || null, d.contactName || null]
    );
    return { id: result.insertId, slug };
  }

  // Creates an account in an organisation, enforcing its seat limit (active accounts).
  // The organisation row is locked for the duration, so two parallel requests cannot both take
  // the last seat. Pass an open transaction as conn, or let this open one.
  // user: { username, email, password (hash), role, mustChangePassword }
  static async insertUser(organizationId, user, conn) {
    const own = !conn;
    const c = conn || (await pool.getConnection());
    try {
      if (own) await c.beginTransaction();
      await OrganizationModel.lockSeat(c, organizationId);
      const [result] = await c.query(
        'INSERT INTO users (organization_id, username, email, password, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
        [organizationId, user.username, user.email, user.password, user.role, user.mustChangePassword ? 1 : 0]
      );
      if (own) await c.commit();
      return result.insertId;
    } catch (err) {
      if (own) await c.rollback();
      throw err;
    } finally {
      if (own) c.release();
    }
  }

  // Throws SeatLimitError when one more active account would exceed the limit. Locks the
  // organisation row until the surrounding transaction ends.
  static async lockSeat(conn, organizationId) {
    const [[org]] = await conn.query('SELECT seat_limit FROM organizations WHERE id = ? FOR UPDATE', [organizationId]);
    if (!org) throw Object.assign(new Error('Organisation not found'), { status: 404 });
    if (org.seat_limit === null) return;
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users WHERE organization_id = ? AND is_active = 1', [organizationId]);
    if (n >= org.seat_limit) throw new SeatLimitError(org.seat_limit);
  }

  // Reactivating an account takes a seat too.
  static async activateUser(organizationId, userId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[user]] = await conn.query('SELECT is_active FROM users WHERE id = ? AND organization_id = ? FOR UPDATE', [userId, organizationId]);
      if (!user) { await conn.rollback(); return 0; }
      if (!user.is_active) await OrganizationModel.lockSeat(conn, organizationId);
      const [result] = await conn.query('UPDATE users SET is_active = 1 WHERE id = ? AND organization_id = ?', [userId, organizationId]);
      await conn.commit();
      return result.affectedRows;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // ---------- platform owner console

  static async overview() {
    const [[row]] = await pool.query(`SELECT
        (SELECT COUNT(*) FROM organizations) AS organizations,
        (SELECT COUNT(*) FROM organizations WHERE status = 'pending') AS pending,
        (SELECT COUNT(*) FROM organizations WHERE status = 'active') AS active,
        (SELECT COUNT(*) FROM organizations WHERE status = 'suspended') AS suspended,
        (SELECT COUNT(*) FROM organizations WHERE status = 'rejected') AS rejected,
        (SELECT COUNT(*) FROM enquiries WHERE status = 'new') AS enquiries_new,
        (SELECT COUNT(*) FROM users WHERE organization_id IS NOT NULL) AS users,
        (SELECT COUNT(*) FROM users WHERE organization_id IS NOT NULL AND is_active = 1) AS active_users,
        (SELECT COUNT(*) FROM employees) AS employees,
        (SELECT COUNT(*) FROM organizations WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS signups_30d`);
    return row;
  }

  // status: one of STATUSES or undefined; q matches name, slug or contact e-mail
  static async list({ status, q, limit = 200, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('o.status = ?'); params.push(status); }
    if (q) {
      where.push('(o.name LIKE ? OR o.slug LIKE ? OR o.contact_email LIKE ? OR o.contact_name LIKE ? OR o.city LIKE ? OR o.country LIKE ?)');
      const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like, like, like, like, like);
    }
    const [rows] = await pool.query(
      `SELECT o.*, ${COUNTS_SQL} FROM organizations o
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY FIELD(o.status, 'pending', 'active', 'suspended', 'rejected'), o.created_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return rows;
  }

  static async users(organizationId) {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
              e.id AS employee_id, e.FullName AS employee_name
       FROM users u LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.organization_id = ? ORDER BY u.id`,
      [organizationId]
    );
    return rows;
  }

  static async update(id, { name, plan, seatLimit, contactEmail, details = {} }) {
    const d = details || {};
    const [result] = await pool.query(
      `UPDATE organizations SET name = ?, plan = ?, seat_limit = ?, contact_email = ?,
         org_type = ?, size_range = ?, country = ?, city = ?, phone = ?, contact_name = ?
       WHERE id = ?`,
      [name, plan, seatLimit, contactEmail, d.orgType || null, d.sizeRange || null, d.country || null, d.city || null, d.phone || null, d.contactName || null, id]
    );
    return result.affectedRows;
  }

  // Sets the status; the first activation records approved_at. Approving or rejecting records
  // reviewed_at; rejecting stores the optional reason, any other change clears it.
  static async setStatus(id, status, { reason = null, review = false } = {}) {
    const [result] = await pool.query(
      `UPDATE organizations SET status = ?,
         approved_at = IF(? = 'active' AND approved_at IS NULL, CURRENT_TIMESTAMP, approved_at),
         reviewed_at = IF(?, CURRENT_TIMESTAMP, reviewed_at),
         rejection_reason = ?
       WHERE id = ?`,
      [status, status, review ? 1 : 0, status === 'rejected' ? reason : null, id]
    );
    return result.affectedRows;
  }

  // A registration that was never approved (pending or rejected) and has no employee records can
  // be deleted together with its sign-up accounts (those accounts have never been able to sign in).
  // Anything else goes through deleteIfEmpty. Returns 'deleted' | 'not_found' | 'in_use'.
  static async deleteRegistration(id) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[org]] = await conn.query('SELECT status FROM organizations WHERE id = ? FOR UPDATE', [id]);
      if (!org) { await conn.rollback(); return 'not_found'; }
      const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM employees WHERE organization_id = ?', [id]);
      if (!['pending', 'rejected'].includes(org.status) || n > 0) { await conn.rollback(); return 'in_use'; }
      await conn.query('DELETE FROM users WHERE organization_id = ?', [id]);
      await conn.query('DELETE FROM organizations WHERE id = ?', [id]);
      await conn.commit();
      return 'deleted';
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Deletes an organisation only when it has no user accounts, no employee records and no payroll
  // history (its empty departments go with it). Returns 'deleted' | 'not_found' | 'in_use'.
  static async deleteIfEmpty(id) {
    const [result] = await pool.query(
      `DELETE FROM organizations WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM users WHERE organization_id = ?)
         AND NOT EXISTS (SELECT 1 FROM employees WHERE organization_id = ?)
         AND NOT EXISTS (SELECT 1 FROM payroll_runs WHERE organization_id = ?)`,
      [id, id, id, id]
    );
    if (result.affectedRows) return 'deleted';
    return (await OrganizationModel.findById(id)) ? 'in_use' : 'not_found';
  }
}

module.exports = OrganizationModel;
module.exports.STATUSES = STATUSES;
module.exports.SeatLimitError = SeatLimitError;
module.exports.slugify = slugify;
module.exports.uniqueSlug = uniqueSlug;
