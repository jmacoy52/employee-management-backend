const express = require('express');
const router = express.Router();
const PlatformController = require('../controllers/platformController');
const PlatformBillingController = require('../controllers/platformBillingController');
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

// Organisation admins across organisations. Tenant boundary: the owner only lists and acts on
// organisation admin accounts (status, temporary password, reset link), never HR or employee
// accounts; those stay with the organisation's own admins. The account actions reuse the
// org-admin handlers with an "any organisation" scope; demo protection still applies.
router.get('/admins', PlatformController.listAdmins);
router.put('/admins/:id/status', PlatformController.requireOrgAdminTarget, UserController.setUserStatus);
router.post('/admins/:id/temporary-password', PlatformController.requireOrgAdminTarget, UserController.setTemporaryPassword);
router.post('/admins/:id/reset-link', PlatformController.requireOrgAdminTarget, UserController.createResetLink);

// Subscriptions: revenue overview, plans (prices and limits, no code change needed), discounts and
// per-organisation actions. All changes are audit-logged with scope 'platform'.
router.get('/billing', PlatformBillingController.revenue);
router.get('/billing/settings', PlatformBillingController.settings);
router.get('/plans', PlatformBillingController.plans);
router.put('/plans/:code', PlatformBillingController.updatePlan);
router.get('/coupons', PlatformBillingController.coupons);
router.put('/coupons/:code', PlatformBillingController.updateCoupon);
router.get('/organizations/:id/subscription', PlatformBillingController.subscription);
router.post('/organizations/:id/subscription/extend-trial', PlatformBillingController.extendTrial);
router.post('/organizations/:id/subscription/assign', PlatformBillingController.assignPlan);
router.post('/organizations/:id/subscription/founding-discount', PlatformBillingController.foundingDiscount);
router.post('/organizations/:id/subscription/end-trial', PlatformBillingController.endTrial);
router.post('/organizations/:id/subscription/mark-paid', PlatformBillingController.markPaid);
router.post('/organizations/:id/subscription/cancel', PlatformBillingController.cancel);
router.post('/organizations/:id/subscription/pause', PlatformBillingController.pause);
router.post('/organizations/:id/subscription/resume', PlatformBillingController.resume);

// Platform-level audit log: owner actions and organisation-level events only (scope 'platform')
router.get('/audit-logs', PlatformController.auditLogs);

// "Request a demo" enquiries from the public contact form
router.get('/enquiries', PlatformController.listEnquiries);
router.put('/enquiries/:id/status', PlatformController.setEnquiryStatus);
router.delete('/enquiries/:id', PlatformController.deleteEnquiry);

// The signed-in owner's own account (name and e-mail; the password uses PUT /api/users/change-password)
router.get('/account', PlatformController.getAccount);
router.put('/account', PlatformController.updateAccount);

module.exports = router;
