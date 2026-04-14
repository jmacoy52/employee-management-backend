const db = require('../config/db');

class AuditLogModel {
  // Get all logs (newest first)
  static getAllLogs(organizationId, callback) {
    const query = 'SELECT * FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC';
    db.query(query, [organizationId], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Get recent activities (last 10, newest first)
  static getRecentActivities(organizationId, callback) {
    const query = `
      SELECT al.id, al.action, al.description, al.created_at, u.username
      FROM audit_logs al
      JOIN users u ON al.user_id = u.id
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
  static insertLog(logData, callback) {
    const query = `
      INSERT INTO audit_logs (organization_id, user_id, action, description)
      VALUES (?, ?, ?, ?)
    `;
    const values = [
      logData.organizationId || null,
      logData.userId,      // Who did the action
      logData.action,      // e.g., LOGIN, CREATE_EMPLOYEE
      logData.description  // Details
    ];
    db.query(query, values, callback);
  }
}

module.exports = AuditLogModel;
