const db = require('../config/db');

class AuditLogModel {
  // Get all logs of one organisation (newest first)
  static getAllLogs(organizationId, callback, { limit = 500, offset = 0 } = {}) {
    const query = 'SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC, LogId DESC LIMIT ? OFFSET ?';
    db.query(query, [organizationId, limit, offset], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Get recent activities of one organisation (last 10, newest first)
  static getRecentActivities(organizationId, callback) {
    const query = `
      SELECT al.LogId, al.actions, al.descriptions, al.created_at, u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.UserId = u.id
      WHERE al.organization_id = ?
      ORDER BY al.created_at DESC
      LIMIT 10
    `;
    db.query(query, [organizationId], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Insert a log
  // organizationId: the organisation the event belongs to. When it is left out, the acting user's
  // organisation (from the database) is used; pass null for a platform-level event.
  static insertLog(logData, callback) {
    const explicit = Object.prototype.hasOwnProperty.call(logData, 'organizationId');
    const query = `
      INSERT INTO audit_logs (organization_id, userId, actions, descriptions)
      VALUES (${explicit ? '?' : '(SELECT organization_id FROM users WHERE id = ?)'}, ?, ?, ?)
    `;
    const values = [
      explicit ? logData.organizationId : logData.userId,
      logData.userId,      // Who did the action
      logData.actions,     // e.g., LOGIN, CREATE_EMPLOYEE
      String(logData.descriptions).slice(0, 255) // Details
    ];
    db.query(query, values, callback || ((err) => { if (err) console.error(`Failed to log ${logData.actions}:`, err.message); }));
  }

  // Platform owner: every organisation's log. organizationId: a number, 'platform' (no
  // organisation) or undefined (all). Includes the organisation name and the acting user.
  static listPlatform({ organizationId, action, limit = 200, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (organizationId === 'platform') where.push('al.organization_id IS NULL');
    else if (organizationId) { where.push('al.organization_id = ?'); params.push(organizationId); }
    if (action) { where.push('al.actions = ?'); params.push(action); }
    const query = `
      SELECT al.LogId, al.organization_id, o.name AS organization_name, al.UserId, u.email AS user_email,
             al.actions, al.descriptions, al.created_at
      FROM audit_logs al
      LEFT JOIN organizations o ON o.id = al.organization_id
      LEFT JOIN users u ON u.id = al.UserId
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY al.created_at DESC, al.LogId DESC
      LIMIT ? OFFSET ?`;
    return db.promise().query(query, [...params, limit, offset]).then(([rows]) => rows);
  }
}

module.exports = AuditLogModel;