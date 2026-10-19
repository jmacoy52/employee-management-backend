const express = require('express');
const router = express.Router();
const AuditLogController = require('../controllers/auditLogController');
//const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

const { authenticateToken, authorizeAdmin, authorizeHR } = require('../middleware/authMiddleware');

// Route to get all audit logs (Admin only)
router.get('/', authenticateToken, authorizeAdmin, AuditLogController.getAllAuditLogs);

// Route to get recent activities (HR only)
router.get('/recent', authenticateToken, authorizeHR, AuditLogController.getRecentActivities);

// Route to insert audit log (Admin only, for testing)
// Disabled in production: it let an admin write entries under any user id, which
// undermines the audit trail. Set ENABLE_AUDIT_LOG_TEST_ROUTE=true locally to use it.
if (process.env.ENABLE_AUDIT_LOG_TEST_ROUTE === 'true') {
  router.post('/', authenticateToken, authorizeAdmin, AuditLogController.insertAuditLog);
}

module.exports = router;
