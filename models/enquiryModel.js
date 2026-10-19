const db = require('../config/db');

const pool = db.promise();
const ENQUIRY_STATUSES = ['new', 'contacted', 'closed'];

// "Request a demo" / contact form submissions. Platform-level data: not tied to an organisation.
class EnquiryModel {
  static async insert({ name, organizationName, email, phone, message }) {
    const [result] = await pool.query(
      'INSERT INTO enquiries (name, organization_name, email, phone, message) VALUES (?, ?, ?, ?, ?)',
      [name, organizationName || null, email, phone || null, message]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM enquiries WHERE id = ?', [id]);
    return rows[0] || null;
  }

  // status: one of ENQUIRY_STATUSES or undefined; q matches name, organisation, e-mail or phone
  static async list({ status, q, limit = 200, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      where.push('(name LIKE ? OR organization_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      params.push(like, like, like, like);
    }
    const [rows] = await pool.query(
      `SELECT * FROM enquiries ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY FIELD(status, 'new', 'contacted', 'closed'), created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return rows;
  }

  // The first move to 'contacted' records contacted_at
  static async setStatus(id, status) {
    const [result] = await pool.query(
      `UPDATE enquiries SET status = ?,
         contacted_at = IF(? = 'contacted' AND contacted_at IS NULL, CURRENT_TIMESTAMP, contacted_at)
       WHERE id = ?`,
      [status, status, id]
    );
    return result.affectedRows;
  }

  static async remove(id) {
    const [result] = await pool.query('DELETE FROM enquiries WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = EnquiryModel;
module.exports.ENQUIRY_STATUSES = ENQUIRY_STATUSES;
