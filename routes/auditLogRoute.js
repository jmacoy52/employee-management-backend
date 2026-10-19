const express = require('express');
const router = express.Router();
const AuditLogController = require('../controllers/auditLogController');
//const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

const { authenticateToken, authorizeAdmin } = require('../middleware/authMiddleware');

// Audit-log access: organisation admins only, and only their own organisation's entries
// (the platform owner uses /api/platform/audit-logs). HR and employee accounts get 403.

// Route to get all audit logs (Admin only)
router.get('/', authenticateToken, authorizeAdmin, AuditLogController.getAllAuditLogs);

// Route to get recent activities (Admin only; HR used to have this, removed so HR has no audit-log access)
router.get('/recent', authenticateToken, authorizeAdmin, AuditLogController.getRecentActivities);

// Route to insert audit log (Admin only, for testing)
// Disabled in production: it let an admin write entries under any user id, which
// undermines the audit trail. Set ENABLE_AUDIT_LOG_TEST_ROUTE=true locally to use it.
if (process.env.ENABLE_AUDIT_LOG_TEST_ROUTE === 'true') {
  router.post('/', authenticateToken, authorizeAdmin, AuditLogController.insertAuditLog);
}

module.exports = router;
