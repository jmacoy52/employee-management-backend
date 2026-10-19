const db = require('../config/db');

class AuditLogModel {
  // Get all logs (newest first)
  static getAllLogs(callback, { limit = 500, offset = 0 } = {}) {
    const query = 'SELECT * FROM audit_logs ORDER BY created_at DESC, LogId DESC LIMIT ? OFFSET ?';
    db.query(query, [limit, offset], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Get recent activities (last 10, newest first)
  static getRecentActivities(callback) {
    const query = `
      SELECT al.LogId, al.actions, al.descriptions, al.created_at, u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.UserId = u.id
      ORDER BY al.created_at DESC
      LIMIT 10
    `;
    db.query(query, (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Insert a log
  static insertLog(logData, callback) {
    const query = `
      INSERT INTO audit_logs (userId, actions, descriptions)
      VALUES (?, ?, ?)
    `;
    const values = [
      logData.userId,      // Who did the action
      logData.actions,     // e.g., LOGIN, CREATE_EMPLOYEE
      logData.descriptions // Details
    ];
    db.query(query, values, callback);
  }
}

module.exports = AuditLogModel;