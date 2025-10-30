const AuditLogModel = require('../models/auditLogModel');

class AuditLogController {
  //  Get all audit logs (admin only)
  static getAllAuditLogs(req, res) {
    AuditLogModel.getAllLogs((err, logs) => {
      if (err) {
        console.error('Error fetching audit logs:', err);
        return res.status(500).json({ error: 'Failed to fetch audit logs' });
      }
      res.status(200).json(logs);
    });
  }

  // Get recent activities for HR (last 10 activities)
  static getRecentActivities(req, res) {
    AuditLogModel.getRecentActivities((err, activities) => {
      if (err) {
        console.error('Error fetching recent activities:', err);
        return res.status(500).json({ error: 'Failed to fetch recent activities' });
      }
      res.status(200).json(activities);
    });
  }

  // Insert a log (Admin only, for testing)
  static insertAuditLog(req, res) {
    const { userId, actions, descriptions } = req.body;

    if (!userId || !actions || !descriptions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    AuditLogModel.insertLog({ userId, actions, descriptions }, (err, result) => {
      if (err) {
        console.error('Error inserting audit log:', err);
        return res.status(500).json({ error: 'Failed to insert audit log' });
      }
      res.status(201).json({ message: 'Audit log created successfully', logId: result.insertId });
    });
  }
}

module.exports = AuditLogController;
