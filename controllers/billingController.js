const billing = require('../services/billing');
const paystack = require('../services/paystack');
const { paymentsEnabled } = require('../config/billing');
const { renderInvoicePdf, invoiceFilename } = require('../services/invoicePdf');
const db = require('../config/db');

const pool = db.promise();

function fail(res, err, label) {
  if (err instanceof billing.BillingError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err instanceof paystack.PaystackError) {
    console.error(`Billing: Paystack error while trying to ${label}:`, err.message);
    return res.status(502).json({ error: 'The payment provider did not respond as expected. Please try again in a few minutes.', code: 'PAYSTACK_ERROR' });
  }
  console.error(`Billing: failed to ${label}:`, err.message);
  return res.status(500).json({ error: `Failed to ${label}` });
}

class BillingController {
  // Public: plans for the pricing page, and the founding offer while places remain
  static async publicPlans(req, res) {
    try {
      const [plans, offer] = await Promise.all([billing.listPlans({ publicOnly: true }), billing.publicOffer()]);
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ plans: plans.map(billing.planOut), offer, trialDays: 30, currency: 'GHS' });
    } catch (err) {
      fail(res, err, 'load plans');
    }
  }

  // Any organisation user: the plan, its features and limits (no payment details)
  static async status(req, res) {
    try {
      res.json(await billing.planStatus(req.user.organizationId));
    } catch (err) {
      fail(res, err, 'load the plan');
    }
  }

  // Organisation admin: everything on the Billing page
  static async overview(req, res) {
    try {
      res.json(await billing.billingOverview(req.user.organizationId));
    } catch (err) {
      fail(res, err, 'load billing');
    }
  }

  static async payments(req, res) {
    try {
      const [rows] = await pool.query(
        `SELECT id, reference, invoice_number, plan_code, billing_interval, amount_pesewas, currency, status, channel, description,
                period_start, period_end, paid_at, created_at
         FROM billing_payments WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
        [req.user.organizationId]
      );
      res.json(rows);
    } catch (err) {
      fail(res, err, 'load payments');
    }
  }

  static async invoice(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid payment id' });
    try {
      const [[row]] = await pool.query(
        `SELECT bp.*, o.name AS organization_name, o.contact_email, o.city, o.country, p.name AS plan_name
         FROM billing_payments bp JOIN organizations o ON o.id = bp.organization_id LEFT JOIN plans p ON p.code = bp.plan_code
         WHERE bp.id = ? AND bp.organization_id = ? AND bp.status = 'success'`,
        [id, req.user.organizationId]
      );
      if (!row) return res.status(404).json({ error: 'Invoice not found' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoiceFilename(row)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      renderInvoicePdf(row, res);
    } catch (err) {
      fail(res, err, 'create the invoice');
    }
  }

  static async checkout(req, res) {
    try {
      const { plan, interval } = req.body || {};
      res.status(201).json(await billing.startCheckout(req.user.organizationId, req.user, { plan: String(plan || ''), interval: String(interval || '') }));
    } catch (err) {
      fail(res, err, 'start the payment');
    }
  }

  static async verify(req, res) {
    try {
      res.json(await billing.verifyCheckout(req.user.organizationId, (req.body || {}).reference));
    } catch (err) {
      fail(res, err, 'confirm the payment');
    }
  }

  static async cancel(req, res) {
    try {
      res.json(await billing.cancelRenewal(req.user.organizationId, req.user));
    } catch (err) {
      fail(res, err, 'cancel the renewal');
    }
  }

  static async manageLink(req, res) {
    try {
      res.json(await billing.manageLink(req.user.organizationId));
    } catch (err) {
      fail(res, err, 'open the card page');
    }
  }

  static async dismissNotice(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid notice id' });
    try {
      const [r] = await pool.query('UPDATE billing_notices SET dismissed_at = UTC_TIMESTAMP() WHERE id = ? AND organization_id = ? AND dismissed_at IS NULL', [id, req.user.organizationId]);
      if (!r.affectedRows) return res.status(404).json({ error: 'Notice not found' });
      res.json({ message: 'Notice dismissed' });
    } catch (err) {
      fail(res, err, 'dismiss the notice');
    }
  }

  // Paystack webhook. Mounted with express.raw so the signature is checked over the exact bytes received.
  static async webhook(req, res) {
    if (!paymentsEnabled()) return res.status(503).json({ error: 'Payments are not configured' });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!paystack.verifySignature(raw, req.get('x-paystack-signature'))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    try {
      const result = await billing.handleWebhook(raw);
      res.status(200).json({ received: true, ...result });
    } catch (err) {
      if (err instanceof billing.BillingError && err.status === 400) return res.status(400).json({ error: err.message });
      console.error('Billing: webhook processing failed:', err.message);
      // A non-2xx answer makes Paystack retry; the failed event is processed again on the retry
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
}

module.exports = BillingController;
