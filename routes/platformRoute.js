const express = require('express');
const router = express.Router();
const PlatformController = require('../controllers/platformController');
const UserController = require('../controllers/userController');
const { authenticateToken, authorizeOwner } = require('../middleware/authMiddleware');
const { orgSignupLimiter } = require('../config/rateLimits');

// One-time owner bootstrap (public, rate-limited; 410 once an owner exists)
router.post('/bootstrap-owner', orgSignupLimiter, PlatformController.bootstrapOwner);

// Everything else: platform owner only
router.use(authenticateToken, authorizeOwner);

router.get('/overview', PlatformController.overview);

// Organisations: list/search/filter, create with first admin, detail, edit, status, delete (only when empty)
router.get('/organizations', PlatformController.listOrganizations);
router.post('/organizations', PlatformController.createOrganization);
router.get('/organizations/:id', PlatformController.getOrganization);
router.put('/organizations/:id', PlatformController.updateOrganization);
router.post('/organizations/:id/approve', PlatformController.statusAction('approve'));
router.post('/organizations/:id/suspend', PlatformController.statusAction('suspend'));
router.post('/organizations/:id/reactivate', PlatformController.statusAction('reactivate'));
router.post('/organizations/:id/reject', PlatformController.statusAction('reject'));
router.delete('/organizations/:id', PlatformController.deleteOrganization);

// Users across organisations. The account actions reuse the org-admin handlers with an
// "any organisation" scope (owners are never matched); demo protection still applies.
router.get('/users', PlatformController.listUsers);
router.put('/users/:id/status', UserController.setUserStatus);
router.post('/users/:id/temporary-password', UserController.setTemporaryPassword);
router.post('/users/:id/reset-link', UserController.createResetLink);

// Audit log of every organisation (and platform-level events)
router.get('/audit-logs', PlatformController.auditLogs);

// "Request a demo" enquiries from the public contact form
router.get('/enquiries', PlatformController.listEnquiries);
router.put('/enquiries/:id/status', PlatformController.setEnquiryStatus);
router.delete('/enquiries/:id', PlatformController.deleteEnquiry);

// The signed-in owner's own account (name and e-mail; the password uses PUT /api/users/change-password)
router.get('/account', PlatformController.getAccount);
router.put('/account', PlatformController.updateAccount);

module.exports = router;
