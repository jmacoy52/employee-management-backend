// Platform owner: plans, discounts, revenue and per-organisation subscription actions. Every change is
// audit-logged with scope 'platform' (services/billing.js).
const billing = require('../services/billing');
const paystack = require('../services/paystack');

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function fail(res, err, label) {
  if (err instanceof billing.BillingError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof paystack.PaystackError) return res.status(502).json({ error: `Paystack: ${err.message}`, code: 'PAYSTACK_ERROR' });
  console.error(`Platform billing: failed to ${label}:`, err.message);
  return res.status(500).json({ error: `Failed to ${label}` });
}

const withOrg = (label, fn) => async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid organisation id' });
  try {
    const exists = await billing.getSubscription(id).catch(() => null);
    if (!exists) return res.status(404).json({ error: 'Organisation not found' });
    res.json(await fn(id, req));
  } catch (err) {
    fail(res, err, label);
  }
};

class PlatformBillingController {
  static async revenue(req, res) {
    try {
      res.json(await billing.revenueOverview());
    } catch (err) {
      fail(res, err, 'load revenue');
    }
  }

  static async plans(req, res) {
    try {
      res.json((await billing.listPlans()).map(billing.planOut));
    } catch (err) {
      fail(res, err, 'load plans');
    }
  }

  static async updatePlan(req, res) {
    try {
      res.json(await billing.updatePlan(String(req.params.code), req.body || {}, req.user));
    } catch (err) {
      fail(res, err, 'update the plan');
    }
  }

  static async settings(req, res) {
    try {
      res.json(await billing.paymentsSettings());
    } catch (err) {
      fail(res, err, 'load the payment settings');
    }
  }

  static async coupons(req, res) {
    try {
      res.json(await billing.listCoupons());
    } catch (err) {
      fail(res, err, 'load discounts');
    }
  }

  static async updateCoupon(req, res) {
    try {
      res.json(await billing.updateCoupon(String(req.params.code), req.body || {}, req.user));
    } catch (err) {
      fail(res, err, 'update the discount');
    }
  }
}

PlatformBillingController.subscription = withOrg('load the subscription', (id) => billing.organisationBilling(id));
PlatformBillingController.extendTrial = withOrg('extend the trial', (id, req) => billing.extendTrial(id, (req.body || {}).days, req.user));
PlatformBillingController.assignPlan = withOrg('assign the plan', (id, req) => billing.assignPlan(id, req.body || {}, req.user));
PlatformBillingController.foundingDiscount = withOrg('apply the discount', (id, req) => billing.applyFoundingDiscount(id, req.user));

PlatformBillingController.endTrial = withOrg('end the trial', (id, req) => billing.endTrialNow(id, req.body || {}, req.user));
PlatformBillingController.markPaid = withOrg('record the payment', (id, req) => billing.markPaid(id, req.body || {}, req.user));
PlatformBillingController.cancel = withOrg('cancel the subscription', (id, req) => billing.cancelSubscription(id, req.body || {}, req.user));
PlatformBillingController.pause = withOrg('pause the subscription', (id, req) => billing.pauseSubscription(id, req.body || {}, req.user));
PlatformBillingController.resume = withOrg('resume the subscription', (id, req) => billing.resumeSubscription(id, req.user));

module.exports = PlatformBillingController;
