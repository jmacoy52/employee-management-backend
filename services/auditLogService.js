const db = require('../config/db');
const util = require('util');

class AuditLogService {
  static async log(action, description, options = {}, req = null) {
    const queryAsync = util.promisify(db.query).bind(db);
    const queueMicrotask = (fn) => setImmediate(fn);

    queueMicrotask(async () => {
      try {
        const { userId, organizationId, entityId, beforeValue, afterValue } = options;
        const ip = req ? (req.ip || req.connection.remoteAddress || req.socket.remoteAddress) : null;
        const userAgent = req ? req.get('User-Agent') : null;

        const query = `
          INSERT INTO audit_logs (organization_id, user_id, action, description, entity_id, before_value, after_value, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
          organizationId || req?.user?.organization_id || null,
          userId,
          action,
          description,
          entityId || null,
          JSON.stringify(beforeValue || {}),
          JSON.stringify(afterValue || {}),
          ip,
          userAgent
        ];
        await queryAsync(query, values);
      } catch (err) {
        console.error('Audit log insert failed:', err);
      }
    });
  }

  static async archiveOldLogs() {
    const queryAsync = util.promisify(db.query).bind(db);
    try {
      const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const cutoffStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');
      
      // Assume audit_logs_archive table exists; create if not
      await queryAsync(`
        INSERT IGNORE INTO audit_logs_archive 
        SELECT * FROM audit_logs WHERE created_at < ?
      `, [cutoffStr]);
      
      await queryAsync('DELETE FROM audit_logs WHERE created_at < ?', [cutoffStr]);
      console.log('Old logs archived.');
    } catch (err) {
      console.error('Archive failed:', err);
    }
  }
}

module.exports = AuditLogService;
