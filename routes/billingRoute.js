const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/billingController');
const { authenticateToken, authorizeAdmin } = require('../middleware/authMiddleware');
const { callbackLimiter } = require('../config/rateLimits');

// Public: the price list (pricing page)
router.get('/plans', BillingController.publicPlans);

// Public: payment return page for a payer who is not signed in. Returns only a status word.
router.post('/callback-status', callbackLimiter, BillingController.publicCallback);

// Paystack webhook (public; authenticated by the x-paystack-signature HMAC). server.js mounts it with
// express.raw before the JSON parser; this line only documents the path.
// POST /api/billing/paystack/webhook

// Any signed-in organisation user: the plan and its limits (drives "upgrade" messages)
router.get('/status', authenticateToken, (req, res, next) => {
  if (!req.user.organizationId) return res.status(403).json({ error: 'Billing belongs to organisations' });
  next();
}, BillingController.status);

// Organisation admins only: billing is managed by the organisation's admin, never HR or employees
router.use(authenticateToken, authorizeAdmin);
router.get('/', BillingController.overview);
router.get('/payments', BillingController.payments);
router.get('/payments/:id/invoice', BillingController.invoice);
router.post('/checkout', BillingController.checkout);
router.post('/verify', BillingController.verify);
router.post('/cancel', BillingController.cancel);
router.post('/manage-card', BillingController.manageLink);
router.post('/notices/:id/dismiss', BillingController.dismissNotice);

module.exports = router;
