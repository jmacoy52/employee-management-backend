const db = require('../config/db');

// Who may read an entry (migration 008). Organisation-level events are 'platform' and are what the
// platform owner sees; everything else is 'tenant' and only that organisation's admins see it.
const SCOPES = ['tenant', 'platform'];
const PLATFORM_ACTIONS = [
  'REGISTER_ORGANIZATION', 'CREATE_ORGANIZATION', 'UPDATE_ORGANIZATION', 'DELETE_ORGANIZATION',
  'APPROVE_ORGANIZATION', 'REJECT_ORGANIZATION', 'SUSPEND_ORGANIZATION', 'REACTIVATE_ORGANIZATION',
  'CREATE_ENQUIRY', 'UPDATE_ENQUIRY', 'DELETE_ENQUIRY',
  'BOOTSTRAP_OWNER', 'CREATE_OWNER', 'UPDATE_OWNER_ACCOUNT', 'CREATE_ADMIN',
];

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
      ORDER BY al.created_at DESC, al.LogId DESC
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
  // scope (migration 008): 'platform' for organisation-level actions (PLATFORM_ACTIONS) and for
  // anything a platform owner does, otherwise 'tenant'. logData.scope overrides it.
  static insertLog(logData, callback) {
    const explicit = Object.prototype.hasOwnProperty.call(logData, 'organizationId');
    const forced = SCOPES.includes(logData.scope) ? logData.scope : null;
    const query = `
      INSERT INTO audit_logs (organization_id, userId, actions, descriptions, scope)
      VALUES (${explicit ? '?' : '(SELECT organization_id FROM users WHERE id = ?)'}, ?, ?, ?,
              CASE WHEN ? IS NOT NULL THEN ?
                   WHEN ? = 1 THEN 'platform'
                   WHEN EXISTS (SELECT 1 FROM users WHERE id = ? AND role = 'owner') THEN 'platform'
                   ELSE 'tenant' END)
    `;
    const values = [
      explicit ? logData.organizationId : logData.userId,
      logData.userId,      // Who did the action
      logData.actions,     // e.g., LOGIN, CREATE_EMPLOYEE
      String(logData.descriptions).slice(0, 255), // Details
      forced, forced,
      PLATFORM_ACTIONS.includes(logData.actions) ? 1 : 0,
      logData.userId == null ? null : logData.userId,
    ];
    db.query(query, values, callback || ((err) => { if (err) console.error(`Failed to log ${logData.actions}:`, err.message); }));
  }

  // Platform owner: platform-scope entries only (owner actions and organisation-level events),
  // never routine activity inside an organisation. organizationId: a number, 'platform' (no
  // organisation) or undefined (all). Includes the organisation name and the acting user.
  static listPlatform({ organizationId, action, limit = 200, offset = 0 } = {}) {
    const where = ["al.scope = 'platform'"];
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
      WHERE ${where.join(' AND ')}
      ORDER BY al.created_at DESC, al.LogId DESC
      LIMIT ? OFFSET ?`;
    return db.promise().query(query, [...params, limit, offset]).then(([rows]) => rows);
  }
}

AuditLogModel.SCOPES = SCOPES;
AuditLogModel.PLATFORM_ACTIONS = PLATFORM_ACTIONS;

module.exports = AuditLogModel;