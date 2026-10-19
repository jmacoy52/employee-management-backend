// Subscriptions: plans, entitlements, Paystack checkout/activation, webhook handling and owner actions.
// Raw SQL through the shared mysql2 pool. Money is integer pesewas. All times are UTC (DATETIME columns are
// compared with UTC_TIMESTAMP(); the pool runs with timezone 'Z').
const crypto = require('crypto');
const db = require('../config/db');
const paystack = require('./paystack');
const AuditLogModel = require('../models/auditLogModel');
const B = require('../config/billing');

const pool = db.promise();

class BillingError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- small helpers
const addMonths = (date, months) => {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const periodEndFrom = (start, interval) => addMonths(start, interval === 'yearly' ? 12 : 1);
const validDate = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const ghs = (pesewas) => `GHS ${(Number(pesewas || 0) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const dateText = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function audit(organizationId, userId, actions, descriptions) {
  AuditLogModel.insertLog({ userId: userId || null, organizationId, actions, descriptions, scope: 'platform' });
}

async function addNotice(conn, organizationId, kind, message, dedupeKey) {
  const [r] = await conn.query(
    'INSERT IGNORE INTO billing_notices (organization_id, kind, message, dedupe_key) VALUES (?, ?, ?, ?)',
    [organizationId, kind, message.slice(0, 500), dedupeKey.slice(0, 191)]
  );
  return r.affectedRows > 0;
}

// ---------- plans
const PLAN_FIELDS = 'code, name, tagline, price_monthly_pesewas, price_yearly_pesewas, included_employees, extra_employee_pesewas, max_admins, max_hr, feature_payroll, feature_audit_log, feature_priority_support, features_text, is_public, is_self_serve, is_highlighted, sort_order, updated_at';

function planOut(p) {
  if (!p) return null;
  return {
    code: p.code, name: p.name, tagline: p.tagline,
    priceMonthly: p.price_monthly_pesewas, priceYearly: p.price_yearly_pesewas,
    includedEmployees: p.included_employees, extraEmployee: p.extra_employee_pesewas,
    maxAdmins: p.max_admins, maxHr: p.max_hr,
    features: { payroll: Boolean(p.feature_payroll), auditLog: Boolean(p.feature_audit_log), prioritySupport: Boolean(p.feature_priority_support) },
    featureList: String(p.features_text || '').split('\n').map((s) => s.trim()).filter(Boolean),
    isPublic: Boolean(p.is_public), selfServe: Boolean(p.is_self_serve), highlighted: Boolean(p.is_highlighted),
    sortOrder: p.sort_order, updatedAt: p.updated_at,
  };
}

async function listPlans({ publicOnly = false } = {}, conn = pool) {
  const [rows] = await conn.query(`SELECT ${PLAN_FIELDS} FROM plans ${publicOnly ? 'WHERE is_public = 1' : ''} ORDER BY sort_order, code`);
  return rows;
}

async function getPlan(code, conn = pool) {
  const [[row]] = await conn.query(`SELECT ${PLAN_FIELDS} FROM plans WHERE code = ?`, [code]);
  return row || null;
}

// ---------- subscriptions
// Every organisation has a row; this creates it on first use (organisations made before migration 009 got one
// from the migration; this covers ones created by scripts). The demo organisation is always exempt (Growth).
async function ensureSubscription(organizationId, conn = pool) {
  await conn.query(
    `INSERT IGNORE INTO organization_subscriptions (organization_id, plan_code, status, billing_mode, trial_ends_at)
     SELECT id, ?, IF(slug = 'demo', 'active', 'trialing'), IF(slug = 'demo', 'exempt', 'paystack'),
            CASE WHEN slug = 'demo' THEN NULL
                 WHEN status IN ('active', 'suspended') THEN UTC_TIMESTAMP() + INTERVAL ? DAY ELSE NULL END
     FROM organizations WHERE id = ?`,
    [B.TRIAL_PLAN, B.TRIAL_DAYS, organizationId]
  );
}

async function getSubscription(organizationId, conn = pool, { lock = false } = {}) {
  await ensureSubscription(organizationId, conn);
  const [[row]] = await conn.query(
    `SELECT s.*, o.name AS organization_name, o.slug AS organization_slug, o.status AS organization_status
     FROM organization_subscriptions s JOIN organizations o ON o.id = s.organization_id
     WHERE s.organization_id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [organizationId]
  );
  return row || null;
}

// The plan whose limits and features apply now. Grace keeps the paid plan working; Free is Free.
function effectivePlanCode(sub) {
  return sub.status === 'free' || sub.status === 'paused' ? B.FREE_PLAN : sub.plan_code;
}

// Limits and features for a subscription and its effective plan.
//   employeeLimit  employees included (NULL = unlimited)
//   employeeCap    hard cap on creating employees (NULL = none). Paid self-serve plans with an extra-employee
//                  price have no hard cap: extra employees are added to the next renewal.
function entitlementsFor(sub, plan) {
  const employeeLimit = sub.employee_limit_override != null ? sub.employee_limit_override : plan.included_employees;
  const extrasAllowed = sub.billing_mode === 'paystack' && ['active', 'grace'].includes(sub.status)
    && plan.extra_employee_pesewas != null && employeeLimit != null && sub.employee_limit_override == null;
  return {
    plan: plan.code,
    planName: plan.name,
    status: sub.status,
    billingMode: sub.billing_mode,
    employeeLimit,
    employeeCap: extrasAllowed ? null : employeeLimit,
    extrasAllowed,
    maxAdmins: plan.max_admins,
    maxHr: plan.max_hr,
    features: { payroll: Boolean(plan.feature_payroll), auditLog: Boolean(plan.feature_audit_log), prioritySupport: Boolean(plan.feature_priority_support) },
  };
}

async function getEntitlements(organizationId, conn = pool) {
  const sub = await getSubscription(organizationId, conn);
  if (!sub) return null;
  const plan = await getPlan(effectivePlanCode(sub), conn);
  return { sub, plan, ent: entitlementsFor(sub, plan) };
}

async function usage(organizationId, conn = pool) {
  const [[u]] = await conn.query(
    `SELECT (SELECT COUNT(*) FROM employees WHERE organization_id = ?) AS employees,
            (SELECT COUNT(*) FROM users WHERE organization_id = ? AND is_active = 1 AND role = 'admin') AS admins,
            (SELECT COUNT(*) FROM users WHERE organization_id = ? AND is_active = 1 AND role = 'hr') AS hr,
            (SELECT COUNT(*) FROM users WHERE organization_id = ? AND is_active = 1) AS activeUsers`,
    [organizationId, organizationId, organizationId, organizationId]
  );
  return { employees: Number(u.employees), admins: Number(u.admins), hr: Number(u.hr), activeUsers: Number(u.activeUsers) };
}

// Throws a 409 PLAN_LIMIT_REACHED when one more active account with this role would exceed the plan.
// Call inside the transaction that holds the organisation row lock (OrganizationModel.lockSeat).
async function assertRoleCapacity(conn, organizationId, role, { excludeUserId = null } = {}) {
  if (!['admin', 'hr'].includes(role)) return;
  const { ent } = await getEntitlements(organizationId, conn);
  const max = role === 'admin' ? ent.maxAdmins : ent.maxHr;
  if (max == null) return;
  const [[{ n }]] = await conn.query(
    'SELECT COUNT(*) AS n FROM users WHERE organization_id = ? AND role = ? AND is_active = 1 AND id <> ?',
    [organizationId, role, excludeUserId || 0]
  );
  if (Number(n) >= max) {
    const label = role === 'admin' ? 'admin' : 'HR';
    throw new BillingError(409, max === 0
      ? `The ${ent.planName} plan does not include ${label} accounts. Upgrade your plan to add one.`
      : `The ${ent.planName} plan includes ${max} active ${label} account${max === 1 ? '' : 's'}. Upgrade your plan or deactivate one first.`,
    'PLAN_LIMIT_REACHED');
  }
}

// ---------- prices
// Price of a plan for an interval and a number of employees, with an optional percentage discount.
function quote(plan, interval, employees, discountPercent = 0) {
  const base = interval === 'yearly' ? plan.price_yearly_pesewas : plan.price_monthly_pesewas;
  if (base == null) throw new BillingError(400, `${plan.name} is priced individually. Contact us.`, 'PLAN_NOT_SELF_SERVE');
  const hasExtras = plan.included_employees != null && plan.extra_employee_pesewas != null;
  const extras = hasExtras ? Math.max(0, employees - plan.included_employees) : 0;
  const extraUnit = hasExtras ? plan.extra_employee_pesewas * (interval === 'yearly' ? B.YEARLY_EXTRA_MULTIPLIER : 1) : 0;
  const subtotal = base + extras * extraUnit;
  const discount = discountPercent ? Math.round((subtotal * discountPercent) / 100) : 0;
  return { base, extras, extraUnit, subtotal, discountPercent: discountPercent || 0, discount, total: subtotal - discount };
}

// The discount an organisation gets at checkout: its own running redemption, else an auto-apply coupon with places left
async function discountFor(organizationId, conn = pool) {
  const [[own]] = await conn.query(
    `SELECT r.coupon_code, c.percent_off, r.ends_at FROM billing_coupon_redemptions r JOIN billing_coupons c ON c.code = r.coupon_code
     WHERE r.organization_id = ? AND r.ends_at > UTC_TIMESTAMP() ORDER BY c.percent_off DESC LIMIT 1`,
    [organizationId]
  );
  if (own) return { coupon: own.coupon_code, percent: own.percent_off, endsAt: own.ends_at, redeemed: true };
  const [[used]] = await conn.query('SELECT COUNT(*) AS n FROM billing_coupon_redemptions WHERE organization_id = ?', [organizationId]);
  if (Number(used.n) > 0) return null; // a discount, once used up, is not offered again
  const [[auto]] = await conn.query(
    `SELECT code, percent_off, duration_months FROM billing_coupons
     WHERE is_active = 1 AND auto_apply = 1 AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
     ORDER BY percent_off DESC LIMIT 1`
  );
  return auto ? { coupon: auto.code, percent: auto.percent_off, months: auto.duration_months, redeemed: false } : null;
}

async function publicOffer(conn = pool) {
  const [[c]] = await conn.query(
    `SELECT code, name, percent_off, duration_months, max_redemptions FROM billing_coupons
     WHERE is_active = 1 AND auto_apply = 1 AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
     ORDER BY percent_off DESC LIMIT 1`
  );
  return c ? { code: c.code, name: c.name, percentOff: c.percent_off, months: c.duration_months, places: c.max_redemptions } : null;
}

// Redeems a coupon for an organisation (locks the coupon row so the cap holds). honour = redeem even when the
// coupon is now full or switched off (the customer was already charged the discounted price).
async function redeemCoupon(conn, organizationId, code, { honour = false, by = null } = {}) {
  const [[c]] = await conn.query('SELECT * FROM billing_coupons WHERE code = ? FOR UPDATE', [code]);
  if (!c) return null;
  const [[existing]] = await conn.query('SELECT ends_at FROM billing_coupon_redemptions WHERE coupon_code = ? AND organization_id = ?', [code, organizationId]);
  if (existing) return { percent: c.percent_off, endsAt: existing.ends_at, already: true };
  const open = c.is_active && (c.max_redemptions == null || c.redeemed_count < c.max_redemptions);
  if (!open && !honour) return null;
  const endsAt = addMonths(new Date(), c.duration_months);
  await conn.query('INSERT INTO billing_coupon_redemptions (coupon_code, organization_id, ends_at, applied_by) VALUES (?, ?, ?, ?)', [code, organizationId, endsAt, by]);
  await conn.query('UPDATE billing_coupons SET redeemed_count = redeemed_count + 1 WHERE code = ?', [code]);
  return { percent: c.percent_off, endsAt, already: false };
}

// ---------- organisation admin: overview
async function billingOverview(organizationId) {
  const { sub, plan, ent } = await getEntitlements(organizationId);
  const [use, plans, discount, offer] = await Promise.all([
    usage(organizationId), listPlans({ publicOnly: true }), discountFor(organizationId), publicOffer(),
  ]);
  const [notices] = await pool.query(
    'SELECT id, kind, message, created_at FROM billing_notices WHERE organization_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 5',
    [organizationId]
  );
  const subscribedPlan = sub.plan_code === plan.code ? plan : await getPlan(sub.plan_code);
  return {
    paymentsEnabled: B.paymentsEnabled(),
    subscription: {
      plan: planOut(plan),
      subscribedPlan: planOut(subscribedPlan),
      status: sub.status,
      billingMode: sub.billing_mode,
      interval: sub.billing_interval,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      graceEndsAt: sub.grace_ends_at,
      graceReason: sub.grace_reason,
      amount: sub.amount_pesewas,
      extraEmployeesBilled: sub.extra_employees_billed,
      discount: sub.discount_percent ? { coupon: sub.discount_coupon, percent: sub.discount_percent, endsAt: sub.discount_ends_at } : null,
      lastPaymentStatus: sub.last_payment_status,
      lastPaymentAt: sub.last_payment_at,
      hasPaystackSubscription: Boolean(sub.paystack_subscription_code),
      manualUntil: sub.manual_until,
    },
    entitlements: ent,
    usage: use,
    overLimit: { employees: ent.employeeCap != null && use.employees > ent.employeeCap },
    plans: plans.map(planOut),
    discount: discount ? { coupon: discount.coupon, percent: discount.percent, endsAt: discount.endsAt || null, months: discount.months || null } : null,
    offer,
    notices,
  };
}

// What every signed-in organisation user may know (drives "upgrade" messages in the app; no payment data)
async function planStatus(organizationId) {
  const { sub, ent } = await getEntitlements(organizationId);
  const use = await usage(organizationId);
  return {
    plan: ent.plan, planName: ent.planName, status: sub.status, billingMode: sub.billing_mode,
    trialEndsAt: sub.trial_ends_at, graceEndsAt: sub.grace_ends_at,
    features: ent.features, employeeLimit: ent.employeeLimit, employeeCap: ent.employeeCap,
    employees: use.employees, overEmployeeLimit: ent.employeeCap != null && use.employees > ent.employeeCap,
  };
}

// ---------- checkout (organisation admin)
// Starts a Paystack payment for a plan and interval. Each organisation gets its own Paystack plan per
// price, so the subscription maps back to exactly one organisation and its amount can follow extra employees
// and the end of a discount (Paystack "update existing subscriptions").
async function startCheckout(organizationId, user, { plan: planCode, interval }) {
  if (!B.paymentsEnabled()) throw new BillingError(503, 'Payments are coming soon. Contact us to change your plan.', 'PAYMENTS_NOT_CONFIGURED');
  if (!B.INTERVALS.includes(interval)) throw new BillingError(400, 'Choose monthly or yearly billing', 'INVALID_INTERVAL');
  const sub = await getSubscription(organizationId);
  if (sub.billing_mode === 'exempt') throw new BillingError(403, 'This is the demo organisation: billing is switched off and it stays on Growth.', 'BILLING_EXEMPT');
  if (sub.billing_mode === 'manual' && sub.status === 'active') throw new BillingError(409, 'Your plan is managed by EmploCore. Contact us to change it.', 'BILLING_MANUAL');
  const plan = await getPlan(planCode);
  if (!plan || !plan.is_public || !plan.is_self_serve) throw new BillingError(400, 'Choose Starter, Growth or Business', 'PLAN_NOT_SELF_SERVE');
  if (sub.status === 'active' && sub.billing_mode === 'paystack' && sub.plan_code === plan.code && sub.billing_interval === interval && !sub.cancel_at_period_end) {
    throw new BillingError(409, `You are already on ${plan.name} (${interval}).`, 'ALREADY_SUBSCRIBED');
  }
  const use = await usage(organizationId);
  const discount = await discountFor(organizationId);
  const q = quote(plan, interval, use.employees, discount ? discount.percent : 0);
  if (q.total < 100) throw new BillingError(400, 'This plan cannot be bought online', 'AMOUNT_TOO_LOW');

  // Reuse this organisation's Paystack plan for the same plan, interval and amount; otherwise create one
  const [[prev]] = await pool.query(
    `SELECT paystack_plan_code FROM billing_checkouts WHERE organization_id = ? AND plan_code = ? AND billing_interval = ?
       AND amount_pesewas = ? AND paystack_plan_code IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [organizationId, plan.code, interval, q.total]
  );
  let paystackPlanCode = prev && prev.paystack_plan_code;
  if (!paystackPlanCode) {
    const created = await paystack.createPlan({
      name: `EmploCore ${plan.name} ${interval} - org ${organizationId}`,
      amount: q.total,
      interval: interval === 'yearly' ? 'annually' : 'monthly',
      description: `EmploCore ${plan.name} for ${sub.organization_name}`,
    });
    paystackPlanCode = created.plan_code;
  }
  const reference = `EC-${organizationId}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  await pool.query(
    `INSERT INTO billing_checkouts (reference, organization_id, plan_code, billing_interval, amount_pesewas, base_pesewas, extra_employees,
       discount_coupon, discount_percent, paystack_plan_code, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [reference, organizationId, plan.code, interval, q.total, q.base, q.extras, discount ? discount.coupon : null, discount ? discount.percent : null, paystackPlanCode, user.id]
  );
  const init = await paystack.initializeTransaction({
    email: user.email,
    amount: q.total,
    plan: paystackPlanCode,
    reference,
    callbackUrl: B.callbackUrl(),
    metadata: { organization_id: organizationId, plan: plan.code, interval, checkout_reference: reference },
  });
  audit(organizationId, user.id, 'BILLING_CHECKOUT_STARTED', `Checkout for ${plan.name} (${interval}, ${ghs(q.total)}) started by ${user.email}`);
  return { reference, authorizationUrl: init.authorization_url, amount: q.total, quote: q };
}

// Applies a verified successful Paystack transaction for one of our checkouts. Safe to call more than once
// (callback page, webhook and daily reconciliation may all see the same payment).
async function activateCheckout(reference, tx, { source = 'verify' } = {}) {
  const conn = await pool.getConnection();
  let result;
  let replaced = null;
  try {
    await conn.beginTransaction();
    const [[co]] = await conn.query('SELECT * FROM billing_checkouts WHERE reference = ? FOR UPDATE', [reference]);
    if (!co) { await conn.rollback(); return { status: 'unknown' }; }
    if (co.status === 'success') { await conn.commit(); return { status: 'already', organizationId: co.organization_id }; }
    const txStatus = tx && tx.status;
    if (txStatus !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(txStatus)) {
        await conn.query("UPDATE billing_checkouts SET status = ?, completed_at = UTC_TIMESTAMP() WHERE reference = ?", [txStatus === 'abandoned' ? 'abandoned' : 'failed', reference]);
      }
      await conn.commit();
      return { status: txStatus || 'pending', organizationId: co.organization_id };
    }
    if (Number(tx.amount) !== co.amount_pesewas || String(tx.currency || 'GHS').toUpperCase() !== B.CURRENCY) {
      await conn.query("UPDATE billing_checkouts SET status = 'failed', completed_at = UTC_TIMESTAMP() WHERE reference = ?", [reference]);
      await conn.commit();
      console.error(`Billing: amount/currency mismatch for ${reference}`);
      return { status: 'mismatch', organizationId: co.organization_id };
    }
    const orgId = co.organization_id;
    const sub = await getSubscription(orgId, conn, { lock: true });
    const plan = await getPlan(co.plan_code, conn);
    const now = validDate(tx.paid_at) || new Date();
    const periodEnd = periodEndFrom(now, co.billing_interval);
    let discount = { percent: null, endsAt: null, coupon: null };
    if (co.discount_coupon) {
      const r = await redeemCoupon(conn, orgId, co.discount_coupon, { honour: true });
      if (r) discount = { percent: r.percent, endsAt: r.endsAt, coupon: co.discount_coupon };
    }
    if (sub.paystack_subscription_code && sub.paystack_plan_code !== co.paystack_plan_code) {
      replaced = { code: sub.paystack_subscription_code, token: sub.paystack_email_token };
    }
    await conn.query(
      `UPDATE organization_subscriptions SET plan_code = ?, status = 'active', billing_mode = 'paystack', billing_interval = ?,
         current_period_end = ?, cancel_at_period_end = 0, grace_ends_at = NULL, grace_reason = NULL,
         amount_pesewas = ?, extra_employees_billed = ?, discount_coupon = ?, discount_percent = ?, discount_ends_at = ?,
         employee_limit_override = NULL, manual_monthly_pesewas = NULL, manual_until = NULL,
         paystack_subscription_code = IF(paystack_plan_code <=> ?, paystack_subscription_code, NULL),
         paystack_email_token = IF(paystack_plan_code <=> ?, paystack_email_token, NULL),
         paystack_plan_code = ?, paystack_customer_code = COALESCE(?, paystack_customer_code),
         last_payment_status = 'success', last_payment_at = ?
       WHERE organization_id = ?`,
      [co.plan_code, co.billing_interval, periodEnd, co.amount_pesewas, co.extra_employees, discount.coupon, discount.percent, discount.endsAt,
        co.paystack_plan_code, co.paystack_plan_code,
        co.paystack_plan_code, tx.customer && tx.customer.customer_code ? tx.customer.customer_code : null, now, orgId]
    );
    // MySQL applies SET assignments left to right, so the subscription code is compared with the old plan code above.
    // Paystack may have sent subscription.create before the payment was verified: apply it now.
    const [[pending]] = await conn.query(
      "SELECT payload FROM billing_events WHERE event_type = 'subscription.create' AND status = 'ignored' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.plan.plan_code')) = ? ORDER BY id DESC LIMIT 1",
      [co.paystack_plan_code]
    );
    if (pending && pending.payload) {
      const p = typeof pending.payload === 'string' ? JSON.parse(pending.payload) : pending.payload;
      await conn.query(
        'UPDATE organization_subscriptions SET paystack_subscription_code = ?, paystack_email_token = ?, current_period_end = COALESCE(?, current_period_end) WHERE organization_id = ?',
        [p.subscription_code || null, p.email_token || null, validDate(p.next_payment_date), orgId]
      );
    }
    await conn.query('UPDATE organizations SET plan = ? WHERE id = ?', [co.plan_code, orgId]);
    await insertPayment(conn, {
      organizationId: orgId, reference, planCode: co.plan_code, interval: co.billing_interval, amount: co.amount_pesewas,
      status: 'success', channel: tx.channel, transactionId: tx.id, periodStart: now, periodEnd, paidAt: now,
      description: `${plan.name} plan, ${co.billing_interval}${co.extra_employees ? ` (+${co.extra_employees} extra employees)` : ''}${discount.percent ? `, ${discount.percent}% founding discount` : ''}`,
    });
    await conn.query("UPDATE billing_checkouts SET status = 'success', completed_at = UTC_TIMESTAMP() WHERE reference = ?", [reference]);
    await addNotice(conn, orgId, 'payment_success', `Payment received: you are on ${plan.name} until ${dateText(periodEnd)}. Thank you.`, `paid:${reference}`);
    await conn.commit();
    result = { status: 'activated', organizationId: orgId, plan: co.plan_code, periodEnd };
    audit(orgId, co.created_by, 'BILLING_SUBSCRIPTION_ACTIVATED', `${plan.name} (${co.billing_interval}) activated after payment ${reference} of ${ghs(co.amount_pesewas)} (${source})`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  // Stop charging for the plan that was replaced (an upgrade or a change of interval)
  if (replaced && replaced.token) {
    paystack.disableSubscription(replaced.code, replaced.token).catch((err) => console.error('Billing: could not disable replaced subscription:', err.message));
  }
  return result;
}

async function insertPayment(conn, p) {
  const [r] = await conn.query(
    `INSERT IGNORE INTO billing_payments (organization_id, reference, plan_code, billing_interval, amount_pesewas, currency, status, channel,
       paystack_transaction_id, description, period_start, period_end, paid_at) VALUES (?, ?, ?, ?, ?, 'GHS', ?, ?, ?, ?, ?, ?, ?)`,
    [p.organizationId, p.reference, p.planCode || null, p.interval || null, p.amount, p.status, p.channel || null,
      p.transactionId || null, (p.description || '').slice(0, 255), p.periodStart || null, p.periodEnd || null, p.paidAt || null]
  );
  if (r.affectedRows && p.status === 'success') {
    const year = (p.paidAt || new Date()).getUTCFullYear();
    await conn.query('UPDATE billing_payments SET invoice_number = ? WHERE id = ?', [`EC-${year}-${String(r.insertId).padStart(6, '0')}`, r.insertId]);
  }
  return r.affectedRows > 0;
}

// Callback page: the admin returns from Paystack with ?reference=. Verified server-side with Paystack.
async function verifyCheckout(organizationId, reference) {
  const [[co]] = await pool.query('SELECT reference, organization_id, status FROM billing_checkouts WHERE reference = ?', [String(reference || '')]);
  if (!co || co.organization_id !== organizationId) throw new BillingError(404, 'Payment not found', 'NOT_FOUND');
  if (co.status === 'success') return { status: 'already' };
  if (!B.paymentsEnabled()) throw new BillingError(503, 'Payments are not configured', 'PAYMENTS_NOT_CONFIGURED');
  const tx = await paystack.verifyTransaction(co.reference);
  const r = await activateCheckout(co.reference, tx, { source: 'callback' });
  return { status: r.status };
}

// Admin: stop the subscription renewing. The plan stays until the end of the paid period, then the grace period
// starts and the organisation moves to Free (data is kept).
async function cancelRenewal(organizationId, user) {
  const sub = await getSubscription(organizationId);
  if (sub.billing_mode !== 'paystack' || sub.status !== 'active') throw new BillingError(409, 'There is no paid subscription to cancel', 'NO_SUBSCRIPTION');
  if (sub.cancel_at_period_end) return { status: 'already' };
  if (sub.paystack_subscription_code && sub.paystack_email_token && B.paymentsEnabled()) {
    await paystack.disableSubscription(sub.paystack_subscription_code, sub.paystack_email_token);
  }
  await pool.query('UPDATE organization_subscriptions SET cancel_at_period_end = 1 WHERE organization_id = ?', [organizationId]);
  audit(organizationId, user.id, 'BILLING_RENEWAL_CANCELLED', `Renewal cancelled by ${user.email}; plan ends ${day(sub.current_period_end)}`);
  return { status: 'cancelled', endsAt: sub.current_period_end };
}

// Admin: a Paystack page where they can change the card used for the subscription
async function manageLink(organizationId) {
  const sub = await getSubscription(organizationId);
  if (!sub.paystack_subscription_code || !B.paymentsEnabled()) throw new BillingError(409, 'There is no card on file to update', 'NO_SUBSCRIPTION');
  const data = await paystack.manageLink(sub.paystack_subscription_code);
  return { link: data.link };
}

// ---------- Paystack webhooks
// Removes values that should not be stored (reusable card authorisation codes, card details beyond the last 4)
function sanitise(data) {
  const copy = JSON.parse(JSON.stringify(data || {}));
  const strip = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (['authorization_code', 'signature', 'bin', 'account_name', 'ip_address', 'metadata'].includes(k)) delete o[k];
      else strip(o[k]);
    }
  };
  strip(copy);
  return copy;
}

function eventKey(event, data, rawBody) {
  const ident = data && (data.id || data.reference || data.invoice_code || data.subscription_code);
  if (!ident) return `${event}:sha256:${crypto.createHash('sha256').update(rawBody).digest('hex')}`;
  return `${event}:${data.id || ''}:${data.reference || data.invoice_code || data.subscription_code || ''}`.slice(0, 191);
}

async function orgForPlanCode(planCode, conn = pool) {
  if (!planCode) return null;
  const [[s]] = await conn.query('SELECT organization_id FROM organization_subscriptions WHERE paystack_plan_code = ? LIMIT 1', [planCode]);
  if (s) return s.organization_id;
  const [[c]] = await conn.query('SELECT organization_id FROM billing_checkouts WHERE paystack_plan_code = ? ORDER BY created_at DESC LIMIT 1', [planCode]);
  return c ? c.organization_id : null;
}

async function orgForSubscriptionCode(code, conn = pool) {
  if (!code) return null;
  const [[s]] = await conn.query('SELECT organization_id FROM organization_subscriptions WHERE paystack_subscription_code = ? LIMIT 1', [code]);
  return s ? s.organization_id : null;
}

// Handles one verified webhook. Returns { duplicate } or { status }. Throws on a processing error (the event is
// marked failed and a later delivery of the same event is processed again).
async function handleWebhook(rawBody) {
  let body;
  try { body = JSON.parse(rawBody.toString('utf8')); } catch (e) { throw new BillingError(400, 'Invalid JSON', 'INVALID_JSON'); }
  const event = String(body.event || '');
  const data = body.data || {};
  if (!event) throw new BillingError(400, 'Missing event', 'INVALID_EVENT');
  const key = eventKey(event, data, rawBody);
  const payload = JSON.stringify(sanitise(data));
  try {
    await pool.query('INSERT INTO billing_events (event_key, event_type, payload) VALUES (?, ?, ?)', [key, event.slice(0, 60), payload]);
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    const [[prev]] = await pool.query('SELECT status FROM billing_events WHERE event_key = ?', [key]);
    if (prev && prev.status !== 'failed') return { duplicate: true };
    await pool.query("UPDATE billing_events SET status = 'processing', error = NULL WHERE event_key = ?", [key]);
  }
  try {
    const outcome = await applyEvent(event, data);
    await pool.query('UPDATE billing_events SET status = ?, organization_id = ?, processed_at = UTC_TIMESTAMP() WHERE event_key = ?',
      [outcome.applied ? 'processed' : 'ignored', outcome.organizationId || null, key]);
    return { status: outcome.applied ? 'processed' : 'ignored' };
  } catch (err) {
    await pool.query("UPDATE billing_events SET status = 'failed', error = ? WHERE event_key = ?", [String(err.message).slice(0, 255), key]);
    throw err;
  }
}

async function applyEvent(event, data) {
  switch (event) {
    case 'charge.success': return onChargeSuccess(data);
    case 'subscription.create': return onSubscriptionCreate(data);
    case 'subscription.disable':
    case 'subscription.not_renew': return onSubscriptionEnding(event, data);
    case 'invoice.payment_failed': return onInvoiceFailed(data);
    default: return { applied: false };
  }
}

async function onChargeSuccess(data) {
  const reference = data.reference;
  const [[co]] = reference ? await pool.query('SELECT reference FROM billing_checkouts WHERE reference = ?', [reference]) : [[null]];
  if (co) {
    // Never trust the webhook body for money: verify the transaction with Paystack
    const tx = await paystack.verifyTransaction(reference);
    const r = await activateCheckout(reference, tx, { source: 'webhook' });
    return { applied: ['activated', 'already'].includes(r.status), organizationId: r.organizationId };
  }
  // A renewal charge made by a Paystack subscription
  const planCode = data.plan && (data.plan.plan_code || data.plan);
  const orgId = await orgForPlanCode(typeof planCode === 'string' ? planCode : null);
  if (!orgId || !reference) return { applied: false };
  const tx = await paystack.verifyTransaction(reference);
  if (tx.status !== 'success') return { applied: false, organizationId: orgId };
  return recordRenewal(orgId, tx);
}

async function recordRenewal(orgId, tx) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sub = await getSubscription(orgId, conn, { lock: true });
    if (sub.billing_mode !== 'paystack' || Number(tx.amount) <= 0) { await conn.rollback(); return { applied: false, organizationId: orgId }; }
    const paidAt = validDate(tx.paid_at) || new Date();
    const from = sub.current_period_end && new Date(sub.current_period_end) > paidAt ? new Date(sub.current_period_end) : paidAt;
    const interval = sub.billing_interval || 'monthly';
    const periodEnd = periodEndFrom(from, interval);
    const plan = await getPlan(sub.plan_code, conn);
    const inserted = await insertPayment(conn, {
      organizationId: orgId, reference: tx.reference, planCode: sub.plan_code, interval, amount: Number(tx.amount), status: 'success',
      channel: tx.channel, transactionId: tx.id, periodStart: from, periodEnd, paidAt, description: `${plan.name} plan, ${interval} renewal`,
    });
    if (!inserted) { await conn.commit(); return { applied: true, organizationId: orgId }; }
    await conn.query(
      `UPDATE organization_subscriptions SET status = 'active', current_period_end = ?, grace_ends_at = NULL, grace_reason = NULL,
         last_payment_status = 'success', last_payment_at = ? WHERE organization_id = ? AND plan_code <> 'free'`,
      [periodEnd, paidAt, orgId]
    );
    await addNotice(conn, orgId, 'payment_success', `Renewal received: ${plan.name} continues until ${dateText(periodEnd)}.`, `paid:${tx.reference}`);
    await conn.commit();
    audit(orgId, null, 'BILLING_RENEWAL_PAID', `Renewal ${tx.reference} of ${ghs(tx.amount)} received; ${plan.name} until ${day(periodEnd)}`);
    return { applied: true, organizationId: orgId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function onSubscriptionCreate(data) {
  const planCode = data.plan && data.plan.plan_code;
  const orgId = await orgForPlanCode(planCode);
  if (!orgId) return { applied: false };
  const [r] = await pool.query(
    `UPDATE organization_subscriptions SET paystack_subscription_code = ?, paystack_email_token = ?,
       paystack_customer_code = COALESCE(?, paystack_customer_code), current_period_end = COALESCE(?, current_period_end)
     WHERE organization_id = ? AND paystack_plan_code = ?`,
    [data.subscription_code || null, data.email_token || null, data.customer && data.customer.customer_code ? data.customer.customer_code : null,
      validDate(data.next_payment_date), orgId, planCode]
  );
  // Not applied yet when the payment has not been verified; activateCheckout picks this event up afterwards
  return { applied: r.affectedRows > 0, organizationId: orgId };
}

async function onSubscriptionEnding(event, data) {
  const orgId = await orgForSubscriptionCode(data.subscription_code);
  if (!orgId) return { applied: false };
  const [r] = await pool.query(
    "UPDATE organization_subscriptions SET cancel_at_period_end = 1 WHERE organization_id = ? AND paystack_subscription_code = ? AND billing_mode = 'paystack'",
    [orgId, data.subscription_code]
  );
  if (r.affectedRows) {
    const [[s]] = await pool.query('SELECT current_period_end FROM organization_subscriptions WHERE organization_id = ?', [orgId]);
    const when = s && s.current_period_end ? ` on ${dateText(s.current_period_end)}` : '';
    await addNotice(pool, orgId, 'subscription_ending', `Your subscription will not renew. Your plan ends${when}; after a ${B.GRACE_DAYS}-day grace period the organisation moves to the Free plan. Your data is kept.`, `ending:${data.subscription_code}`);
    audit(orgId, null, 'BILLING_SUBSCRIPTION_ENDING', `Paystack ${event} for ${data.subscription_code}`);
  }
  return { applied: r.affectedRows > 0, organizationId: orgId };
}

async function onInvoiceFailed(data) {
  const subCode = data.subscription && data.subscription.subscription_code;
  const orgId = await orgForSubscriptionCode(subCode);
  if (!orgId) return { applied: false };
  const graceEnds = addDays(new Date(), B.GRACE_DAYS);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sub = await getSubscription(orgId, conn, { lock: true });
    await insertPayment(conn, {
      organizationId: orgId, reference: data.invoice_code || `failed-${data.id}`, planCode: sub.plan_code, interval: sub.billing_interval,
      amount: Number(data.amount) || 0, status: 'failed', description: 'Renewal payment failed',
    });
    await conn.query(
      `UPDATE organization_subscriptions SET status = IF(status = 'active', 'grace', status),
         grace_ends_at = IF(status = 'grace' AND grace_ends_at IS NOT NULL, grace_ends_at, ?),
         grace_reason = IF(grace_reason IS NULL, 'payment_failed', grace_reason), last_payment_status = 'failed'
       WHERE organization_id = ? AND billing_mode = 'paystack' AND status IN ('active', 'grace')`,
      [graceEnds, orgId]
    );
    await addNotice(conn, orgId, 'payment_failed', `Your renewal payment failed. Update your card by ${dateText(graceEnds)} to keep your plan; after that the organisation moves to the Free plan (your data is kept).`, `failed:${data.invoice_code || data.id}`);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  audit(orgId, null, 'BILLING_PAYMENT_FAILED', `Renewal payment failed (${data.invoice_code || data.id}); grace period started`);
  return { applied: true, organizationId: orgId };
}

// ---------- platform owner
function readPlanFields(body = {}) {
  const money = (v, label, { nullable = false } = {}) => {
    if (v === null || v === '' || v === undefined) {
      if (nullable) return { value: null };
      return { error: `${label} is required` };
    }
    const n = Math.round(Number(v) * 100);
    if (!Number.isFinite(n) || n < 0 || n > 100000000) return { error: `${label} must be an amount in GHS between 0 and 1,000,000` };
    return { value: n };
  };
  const count = (v, label, min) => {
    if (v === null || v === '' || v === undefined) return { value: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > 1000000) return { error: `${label} must be a whole number of at least ${min}, or empty for unlimited` };
    return { value: n };
  };
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 60) return { error: 'Plan name must be between 2 and 60 characters' };
  const tagline = String(body.tagline ?? '').trim().slice(0, 160) || null;
  const fields = { name, tagline };
  for (const [key, label] of [['priceMonthly', 'Monthly price'], ['priceYearly', 'Yearly price'], ['extraEmployee', 'Extra employee price']]) {
    const r = money(body[key], label, { nullable: true });
    if (r.error) return r;
    fields[key] = r.value;
  }
  for (const [key, label, min] of [['includedEmployees', 'Employees included', 0], ['maxAdmins', 'Admin accounts', 1], ['maxHr', 'HR accounts', 0]]) {
    const r = count(body[key], label, min);
    if (r.error) return r;
    fields[key] = r.value;
  }
  const featureList = Array.isArray(body.featureList) ? body.featureList : String(body.featureList || '').split('\n');
  fields.featuresText = featureList.map((s) => String(s).trim()).filter(Boolean).slice(0, 12).map((s) => s.slice(0, 120)).join('\n');
  const flag = (v) => (v ? 1 : 0);
  const f = body.features || {};
  Object.assign(fields, {
    payroll: flag(f.payroll), auditLog: flag(f.auditLog), prioritySupport: flag(f.prioritySupport),
    isPublic: flag(body.isPublic), highlighted: flag(body.highlighted),
  });
  return { fields };
}

async function updatePlan(code, body, user) {
  const before = await getPlan(code);
  if (!before) throw new BillingError(404, 'Plan not found', 'NOT_FOUND');
  const { fields, error } = readPlanFields(body);
  if (error) throw new BillingError(400, error, 'INVALID_PLAN');
  if (code === B.FREE_PLAN && (fields.priceMonthly || fields.priceYearly)) throw new BillingError(400, 'The Free plan cannot have a price', 'INVALID_PLAN');
  if (before.is_self_serve && code !== B.FREE_PLAN && (fields.priceMonthly == null || fields.priceYearly == null)) {
    throw new BillingError(400, 'Self-serve plans need a monthly and a yearly price', 'INVALID_PLAN');
  }
  if (code === B.TRIAL_PLAN && !fields.isPublic) throw new BillingError(400, `${before.name} is the trial plan and must stay public`, 'INVALID_PLAN');
  await pool.query(
    `UPDATE plans SET name = ?, tagline = ?, price_monthly_pesewas = ?, price_yearly_pesewas = ?, included_employees = ?, extra_employee_pesewas = ?,
       max_admins = ?, max_hr = ?, feature_payroll = ?, feature_audit_log = ?, feature_priority_support = ?, features_text = ?,
       is_public = ?, is_highlighted = ? WHERE code = ?`,
    [fields.name, fields.tagline, fields.priceMonthly, fields.priceYearly, fields.includedEmployees, fields.extraEmployee,
      fields.maxAdmins, fields.maxHr, fields.payroll, fields.auditLog, fields.prioritySupport, fields.featuresText,
      fields.isPublic, fields.highlighted, code]
  );
  if (fields.highlighted) await pool.query('UPDATE plans SET is_highlighted = 0 WHERE code <> ?', [code]);
  const changes = [];
  const cmp = (label, a, b, fmt = (v) => (v == null ? 'none' : v)) => { if (a !== b) changes.push(`${label} ${fmt(a)} -> ${fmt(b)}`); };
  const money = (v) => (v == null ? 'custom' : ghs(v));
  cmp('monthly', before.price_monthly_pesewas, fields.priceMonthly, money);
  cmp('yearly', before.price_yearly_pesewas, fields.priceYearly, money);
  cmp('extra employee', before.extra_employee_pesewas, fields.extraEmployee, money);
  cmp('employees', before.included_employees, fields.includedEmployees);
  cmp('admins', before.max_admins, fields.maxAdmins);
  cmp('HR', before.max_hr, fields.maxHr);
  audit(null, user.id, 'UPDATE_PLAN', `Plan ${before.name} updated by ${user.email}${changes.length ? `: ${changes.join(', ')}` : ''}`);
  return planOut(await getPlan(code));
}

async function listCoupons() {
  const [rows] = await pool.query('SELECT code, name, percent_off, duration_months, max_redemptions, redeemed_count, is_active, auto_apply, updated_at FROM billing_coupons ORDER BY code');
  return rows;
}

async function updateCoupon(code, body, user) {
  const [[c]] = await pool.query('SELECT * FROM billing_coupons WHERE code = ?', [code]);
  if (!c) throw new BillingError(404, 'Discount not found', 'NOT_FOUND');
  const isActive = body.isActive === undefined ? c.is_active : (body.isActive ? 1 : 0);
  const percent = body.percentOff === undefined ? c.percent_off : Number(body.percentOff);
  const months = body.durationMonths === undefined ? c.duration_months : Number(body.durationMonths);
  const max = body.maxRedemptions === undefined ? c.max_redemptions : (body.maxRedemptions === null || body.maxRedemptions === '' ? null : Number(body.maxRedemptions));
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) throw new BillingError(400, 'Discount must be a whole percentage from 1 to 90', 'INVALID_COUPON');
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new BillingError(400, 'Duration must be 1 to 36 months', 'INVALID_COUPON');
  if (max !== null && (!Number.isInteger(max) || max < c.redeemed_count || max > 100000)) throw new BillingError(400, `Places must be a whole number of at least ${c.redeemed_count} (already used), or empty for no limit`, 'INVALID_COUPON');
  await pool.query('UPDATE billing_coupons SET is_active = ?, percent_off = ?, duration_months = ?, max_redemptions = ? WHERE code = ?', [isActive, percent, months, max, code]);
  audit(null, user.id, 'UPDATE_DISCOUNT', `Discount ${c.name} (${code}) ${isActive ? 'on' : 'off'}, ${percent}% for ${months} months, ${max == null ? 'no limit' : `${max} places`} - by ${user.email}`);
  const [[after]] = await pool.query('SELECT * FROM billing_coupons WHERE code = ?', [code]);
  return after;
}

function assertOwnerMayChange(sub) {
  if (sub.billing_mode === 'exempt') {
    throw new BillingError(403, 'The demo organisation is exempt from billing and stays on Growth.', 'BILLING_EXEMPT');
  }
}

async function extendTrial(organizationId, days, user) {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 90) throw new BillingError(400, 'Extend by 1 to 90 days', 'INVALID_DAYS');
  const sub = await getSubscription(organizationId);
  if (!sub) throw new BillingError(404, 'Organisation not found', 'NOT_FOUND');
  assertOwnerMayChange(sub);
  if (sub.billing_mode === 'paystack' && sub.status === 'active') throw new BillingError(409, 'This organisation already pays; there is no trial to extend.', 'NOT_TRIALING');
  const from = sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) > new Date() ? new Date(sub.trial_ends_at) : new Date();
  const ends = addDays(from, n);
  await pool.query(
    `UPDATE organization_subscriptions SET plan_code = ?, status = 'trialing', billing_mode = 'paystack', trial_ends_at = ?,
       grace_ends_at = NULL, grace_reason = NULL, cancel_at_period_end = 0 WHERE organization_id = ?`,
    [sub.status === 'trialing' ? sub.plan_code : B.TRIAL_PLAN, ends, organizationId]
  );
  await pool.query('UPDATE organizations SET plan = ? WHERE id = ?', [sub.status === 'trialing' ? sub.plan_code : B.TRIAL_PLAN, organizationId]);
  audit(organizationId, user.id, 'BILLING_TRIAL_EXTENDED', `Trial for ${sub.organization_name} extended by ${n} days to ${day(ends)} by ${user.email}`);
  return { trialEndsAt: ends };
}

// Owner assigns a plan without payment: a complimentary plan, an Enterprise deal, or Free.
//   months: how long (empty = until changed); employeeLimit: overrides the plan's included employees;
//   monthlyPrice (GHS): what the organisation pays outside Paystack (counts towards MRR); note: internal note
async function assignPlan(organizationId, body, user) {
  const sub = await getSubscription(organizationId);
  if (!sub) throw new BillingError(404, 'Organisation not found', 'NOT_FOUND');
  assertOwnerMayChange(sub);
  const plan = await getPlan(String(body.plan || ''));
  if (!plan) throw new BillingError(400, 'Choose a plan', 'INVALID_PLAN');
  const months = body.months === undefined || body.months === null || body.months === '' ? null : Number(body.months);
  if (months !== null && (!Number.isInteger(months) || months < 1 || months > 60)) throw new BillingError(400, 'Months must be 1 to 60, or empty for no end date', 'INVALID_MONTHS');
  const limit = body.employeeLimit === undefined || body.employeeLimit === null || body.employeeLimit === '' ? null : Number(body.employeeLimit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 1000000)) throw new BillingError(400, 'Employee limit must be a whole number of at least 1, or empty for the plan default', 'INVALID_LIMIT');
  const price = body.monthlyPrice === undefined || body.monthlyPrice === null || body.monthlyPrice === '' ? null : Math.round(Number(body.monthlyPrice) * 100);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000000)) throw new BillingError(400, 'Monthly price must be an amount in GHS', 'INVALID_PRICE');
  const note = String(body.note || '').trim().slice(0, 255) || null;
  const until = months ? addMonths(new Date(), months) : null;
  const toFree = plan.code === B.FREE_PLAN;
  // A live Paystack subscription would keep charging: stop it first
  if (sub.paystack_subscription_code && sub.paystack_email_token && B.paymentsEnabled()) {
    await paystack.disableSubscription(sub.paystack_subscription_code, sub.paystack_email_token).catch((err) => {
      throw new BillingError(502, `Could not stop the Paystack subscription first: ${err.message}`, 'PAYSTACK_ERROR');
    });
  }
  await pool.query(
    `UPDATE organization_subscriptions SET plan_code = ?, status = ?, billing_mode = ?, billing_interval = NULL, trial_ends_at = NULL,
       current_period_end = NULL, cancel_at_period_end = 0, grace_ends_at = NULL, grace_reason = NULL, amount_pesewas = NULL,
       employee_limit_override = ?, manual_monthly_pesewas = ?, manual_until = ?, note = ?,
       paystack_subscription_code = NULL, paystack_email_token = NULL, paystack_plan_code = NULL
     WHERE organization_id = ?`,
    [plan.code, toFree ? 'free' : 'active', toFree ? 'paystack' : 'manual', toFree ? null : limit, toFree ? null : price, toFree ? null : until, note, organizationId]
  );
  await pool.query('UPDATE organizations SET plan = ? WHERE id = ?', [plan.code, organizationId]);
  const parts = [plan.name, until ? `until ${day(until)}` : 'no end date', limit ? `${limit} employees` : null, price != null ? `${ghs(price)}/month outside Paystack` : null, note ? `note: ${note}` : null].filter(Boolean);
  audit(organizationId, user.id, 'BILLING_PLAN_ASSIGNED', `Plan assigned to ${sub.organization_name} by ${user.email}: ${parts.join(', ')}`);
  return { plan: plan.code, until };
}

// Owner applies the founding discount to an organisation (counts towards the places, even when they are full)
async function applyFoundingDiscount(organizationId, user, code = 'FOUNDING40') {
  const conn = await pool.getConnection();
  let r;
  let sub;
  try {
    await conn.beginTransaction();
    sub = await getSubscription(organizationId, conn, { lock: true });
    if (!sub) throw new BillingError(404, 'Organisation not found', 'NOT_FOUND');
    assertOwnerMayChange(sub);
    r = await redeemCoupon(conn, organizationId, code, { honour: true, by: user.id });
    if (!r) throw new BillingError(404, 'Discount not found', 'NOT_FOUND');
    if (new Date(r.endsAt) <= new Date()) throw new BillingError(409, 'This organisation has already used the founding discount', 'DISCOUNT_USED');
    let newAmount = null;
    if (sub.billing_mode === 'paystack' && sub.status === 'active' && sub.amount_pesewas && !sub.discount_percent) {
      const plan = await getPlan(sub.plan_code, conn);
      const q = quote(plan, sub.billing_interval || 'monthly', sub.extra_employees_billed + (plan.included_employees || 0), r.percent);
      newAmount = q.total;
    }
    await conn.query(
      'UPDATE organization_subscriptions SET discount_coupon = ?, discount_percent = ?, discount_ends_at = ?, amount_pesewas = COALESCE(?, amount_pesewas) WHERE organization_id = ?',
      [code, r.percent, r.endsAt, newAmount, organizationId]
    );
    await conn.commit();
    if (newAmount && sub.paystack_plan_code && B.paymentsEnabled()) {
      await paystack.updatePlanAmount(sub.paystack_plan_code, newAmount).catch((err) => console.error('Billing: could not update Paystack plan amount:', err.message));
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  audit(organizationId, user.id, 'BILLING_DISCOUNT_APPLIED', `${r.percent}% founding discount applied to ${sub.organization_name} until ${day(r.endsAt)} by ${user.email}`);
  return { percent: r.percent, endsAt: r.endsAt };
}

// Revenue overview for the owner. MRR = monthly value of active paid subscriptions (yearly / 12) plus Enterprise
// or manual deals that have a monthly price. Trials, grace and complimentary plans count as 0.
async function revenueOverview() {
  const [[mrr]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN billing_mode = 'paystack' AND status = 'active' AND amount_pesewas > 0
                         THEN IF(billing_interval = 'yearly', amount_pesewas / 12, amount_pesewas) END), 0) AS paystack_mrr,
       COALESCE(SUM(CASE WHEN billing_mode = 'manual' AND status = 'active' THEN manual_monthly_pesewas END), 0) AS manual_mrr,
       SUM(billing_mode = 'paystack' AND status = 'active' AND amount_pesewas > 0) AS paying,
       SUM(status = 'trialing') AS trialing,
       SUM(status = 'trialing' AND trial_ends_at IS NOT NULL AND trial_ends_at <= UTC_TIMESTAMP() + INTERVAL 7 DAY) AS trials_ending_7d,
       SUM(status = 'grace') AS grace,
       SUM(status = 'free') AS free, SUM(status = 'paused') AS paused,
       SUM(billing_mode = 'manual' AND status = 'active') AS manual,
       SUM(billing_mode = 'exempt') AS exempt
     FROM organization_subscriptions`
  );
  const [byPlan] = await pool.query(
    `SELECT s.plan_code, p.name, COUNT(*) AS organisations,
            COALESCE(SUM(CASE WHEN s.billing_mode = 'paystack' AND s.status = 'active' AND s.amount_pesewas > 0
                              THEN IF(s.billing_interval = 'yearly', s.amount_pesewas / 12, s.amount_pesewas)
                              WHEN s.billing_mode = 'manual' AND s.status = 'active' THEN s.manual_monthly_pesewas END), 0) AS mrr
     FROM organization_subscriptions s JOIN plans p ON p.code = s.plan_code
     WHERE s.status IN ('active', 'grace') GROUP BY s.plan_code, p.name, p.sort_order ORDER BY p.sort_order`
  );
  const [payments] = await pool.query(
    `SELECT bp.id, bp.organization_id, o.name AS organization_name, bp.reference, bp.invoice_number, bp.plan_code, bp.billing_interval,
            bp.amount_pesewas, bp.status, bp.paid_at, bp.created_at
     FROM billing_payments bp JOIN organizations o ON o.id = bp.organization_id ORDER BY bp.created_at DESC, bp.id DESC LIMIT 10`
  );
  const [[collected]] = await pool.query(
    "SELECT COALESCE(SUM(amount_pesewas), 0) AS last30 FROM billing_payments WHERE status = 'success' AND paid_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY"
  );
  const coupons = await listCoupons();
  const total = Math.round(Number(mrr.paystack_mrr) + Number(mrr.manual_mrr));
  return {
    paymentsEnabled: B.paymentsEnabled(),
    mrr: total,
    arr: total * 12,
    collectedLast30Days: Number(collected.last30),
    counts: {
      paying: Number(mrr.paying) || 0, trialing: Number(mrr.trialing) || 0, trialsEnding7d: Number(mrr.trials_ending_7d) || 0,
      grace: Number(mrr.grace) || 0, free: Number(mrr.free) || 0, paused: Number(mrr.paused) || 0, manual: Number(mrr.manual) || 0, exempt: Number(mrr.exempt) || 0,
    },
    byPlan: byPlan.map((r) => ({ plan: r.plan_code, name: r.name, organisations: Number(r.organisations), mrr: Math.round(Number(r.mrr)) })),
    recentPayments: payments,
    coupons,
  };
}

async function organisationBilling(organizationId) {
  const sub = await getSubscription(organizationId);
  if (!sub) return null;
  const [use, plan] = await Promise.all([usage(organizationId), getPlan(effectivePlanCode(sub))]);
  const [payments] = await pool.query(
    `SELECT id, reference, invoice_number, plan_code, billing_interval, amount_pesewas, status, description, paid_at, created_at
     FROM billing_payments WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`, [organizationId]
  );
  return {
    planCode: sub.plan_code, effectivePlan: plan.code, planName: plan.name, status: sub.status, billingMode: sub.billing_mode,
    interval: sub.billing_interval, trialEndsAt: sub.trial_ends_at, currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end), graceEndsAt: sub.grace_ends_at, graceReason: sub.grace_reason,
    amount: sub.amount_pesewas, discountPercent: sub.discount_percent, discountEndsAt: sub.discount_ends_at,
    employeeLimitOverride: sub.employee_limit_override, manualMonthly: sub.manual_monthly_pesewas, manualUntil: sub.manual_until, note: sub.note,
    lastPaymentStatus: sub.last_payment_status, lastPaymentAt: sub.last_payment_at,
    entitlements: entitlementsFor(sub, plan), usage: use, payments,
  };
}

// Columns added to the owner's organisation list
async function subscriptionSummaries(ids) {
  if (!ids.length) return {};
  for (const id of ids) await ensureSubscription(id);
  const [rows] = await pool.query(
    `SELECT organization_id, plan_code, status, billing_mode, billing_interval, trial_ends_at, current_period_end, grace_ends_at,
            last_payment_status, cancel_at_period_end
     FROM organization_subscriptions WHERE organization_id IN (?)`, [ids]
  );
  return Object.fromEntries(rows.map((r) => [r.organization_id, r]));
}

// ---------- Owner controls (migration 010). Every action is audit-logged with scope 'platform'.

async function stopPaystack(sub) {
  if (sub.paystack_subscription_code && sub.paystack_email_token && B.paymentsEnabled()) {
    await paystack.disableSubscription(sub.paystack_subscription_code, sub.paystack_email_token).catch((err) => {
      throw new BillingError(502, `Could not stop the Paystack subscription: ${err.message}`, 'PAYSTACK_ERROR');
    });
  }
}

async function ownerSub(organizationId) {
  const sub = await getSubscription(organizationId);
  if (!sub) throw new BillingError(404, 'Organisation not found', 'NOT_FOUND');
  assertOwnerMayChange(sub);
  return sub;
}

// End a trial now: to the usual 7-day grace period (default) or straight to Free
async function endTrialNow(organizationId, body, user) {
  const sub = await ownerSub(organizationId);
  if (sub.status !== 'trialing') throw new BillingError(409, 'This organisation is not on a trial.', 'NOT_TRIALING');
  const toFree = (body || {}).to === 'free';
  const now = new Date();
  if (toFree) {
    await pool.query(
      `UPDATE organization_subscriptions SET plan_code = ?, status = 'free', trial_ends_at = ?, grace_ends_at = NULL, grace_reason = NULL
       WHERE organization_id = ? AND status = 'trialing'`, [B.FREE_PLAN, now, organizationId]);
    await pool.query('UPDATE organizations SET plan = ? WHERE id = ?', [B.FREE_PLAN, organizationId]);
  } else {
    await pool.query(
      `UPDATE organization_subscriptions SET status = 'grace', trial_ends_at = ?, grace_reason = 'trial_ended', grace_ends_at = ?
       WHERE organization_id = ? AND status = 'trialing'`, [now, addDays(now, B.GRACE_DAYS), organizationId]);
  }
  await addNotice(pool, organizationId, toFree ? 'trial_ended' : 'grace',
    toFree ? 'Your free trial has ended and the organisation is now on the Free plan. Your data is kept; choose a plan on the Billing page to get your features back.'
      : `Your free trial has ended. Choose a plan by ${dateText(addDays(now, B.GRACE_DAYS))} to keep your features; after that the organisation moves to the Free plan. Your data is kept.`,
    `owner-trial-end:${organizationId}:${now.getTime()}`);
  audit(organizationId, user.id, 'BILLING_TRIAL_ENDED', `Trial for ${sub.organization_name} ended early by ${user.email}; ${toFree ? 'moved to Free' : `grace period until ${day(addDays(now, B.GRACE_DAYS))}`}`);
  return { status: toFree ? 'free' : 'grace' };
}

const MANUAL_METHODS = { cash: 'Cash', momo: 'Mobile money', bank: 'Bank transfer', other: 'Other' };

// Record a payment made outside Paystack (cash, mobile money, bank). Creates a paid invoice and gives the
// organisation the plan until the end of the period (billing_mode manual; the daily job applies grace afterwards).
async function markPaid(organizationId, body, user) {
  body = body || {};
  const sub = await ownerSub(organizationId);
  const plan = await getPlan(String(body.plan || ''));
  if (!plan || plan.code === B.FREE_PLAN) throw new BillingError(400, 'Choose the paid plan this payment is for', 'INVALID_PLAN');
  const months = Number(body.months);
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new BillingError(400, 'Period must be 1 to 36 months', 'INVALID_MONTHS');
  const amount = Math.round(Number(body.amount) * 100);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) throw new BillingError(400, 'Enter the amount received in GHS', 'INVALID_AMOUNT');
  const method = String(body.method || '');
  if (!MANUAL_METHODS[method]) throw new BillingError(400, 'Choose how it was paid: cash, mobile money, bank transfer or other', 'INVALID_METHOD');
  const ref = String(body.reference || '').trim().slice(0, 60);
  const note = String(body.note || '').trim().slice(0, 255) || null;
  let paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime()) || paidAt > addDays(new Date(), 1)) throw new BillingError(400, 'Payment date is not valid', 'INVALID_DATE');
  // A renewal of the same manual plan continues from the current end date; otherwise the period starts today
  const now = new Date();
  const continues = sub.billing_mode === 'manual' && sub.status === 'active' && sub.plan_code === plan.code && sub.manual_until && new Date(sub.manual_until) > now;
  const start = continues ? new Date(sub.manual_until) : now;
  const end = addMonths(start, months);
  await stopPaystack(sub);
  const conn = await pool.getConnection();
  let payment;
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE organization_subscriptions SET plan_code = ?, status = 'active', billing_mode = 'manual', billing_interval = ?, trial_ends_at = NULL,
         current_period_end = NULL, cancel_at_period_end = 0, grace_ends_at = NULL, grace_reason = NULL, amount_pesewas = NULL,
         manual_monthly_pesewas = ?, manual_until = ?, note = COALESCE(?, note), paused_at = NULL, paused_from = NULL,
         paystack_subscription_code = NULL, paystack_email_token = NULL, paystack_plan_code = NULL,
         last_payment_status = 'success', last_payment_at = ?
       WHERE organization_id = ?`,
      [plan.code, months === 12 ? 'yearly' : months === 1 ? 'monthly' : null, Math.round(amount / months), end, note, paidAt, organizationId]
    );
    await conn.query('UPDATE organizations SET plan = ? WHERE id = ?', [plan.code, organizationId]);
    const reference = `MAN-${organizationId}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const description = `${plan.name}, ${months} month${months === 1 ? '' : 's'} (${day(start)} to ${day(end)}), paid by ${MANUAL_METHODS[method].toLowerCase()}${ref ? `, ref ${ref}` : ''}`;
    await insertPayment(conn, {
      organizationId, reference, planCode: plan.code, interval: months === 12 ? 'yearly' : months === 1 ? 'monthly' : null, amount,
      status: 'success', channel: `manual:${method}`, description, periodStart: start, periodEnd: end, paidAt,
    });
    [[payment]] = await conn.query('SELECT id, reference, invoice_number, amount_pesewas, description, period_start, period_end, paid_at FROM billing_payments WHERE reference = ?', [reference]);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  await addNotice(pool, organizationId, 'payment', `Payment of ${ghs(amount)} received for ${plan.name}. Your plan runs until ${dateText(end)}. The invoice is on the Billing page.`, `manual-paid:${payment.reference}`);
  audit(organizationId, user.id, 'BILLING_MANUAL_PAYMENT', `Manual payment recorded for ${sub.organization_name} by ${user.email}: ${ghs(amount)} by ${MANUAL_METHODS[method]}${ref ? ` (ref ${ref})` : ''}, ${plan.name} for ${months} month${months === 1 ? '' : 's'} until ${day(end)}, invoice ${payment.invoice_number}${note ? `, note: ${note}` : ''}`);
  return { payment, until: end };
}

// Cancel: 'period_end' stops renewal and keeps the plan until the paid period ends; 'now' moves to Free at once
async function cancelSubscription(organizationId, body, user) {
  const sub = await ownerSub(organizationId);
  const when = (body || {}).when === 'now' ? 'now' : 'period_end';
  if (sub.status === 'free') throw new BillingError(409, 'This organisation is already on Free.', 'ALREADY_FREE');
  if (when === 'period_end') {
    if (!(sub.status === 'active' && sub.billing_mode === 'paystack')) {
      throw new BillingError(409, 'Only an active Paystack subscription can be cancelled at the period end. Use "Cancel now" instead.', 'NOT_RENEWING');
    }
    if (sub.cancel_at_period_end) return { status: 'already', endsAt: sub.current_period_end };
    await stopPaystack(sub);
    await pool.query('UPDATE organization_subscriptions SET cancel_at_period_end = 1 WHERE organization_id = ?', [organizationId]);
    audit(organizationId, user.id, 'BILLING_SUBSCRIPTION_CANCELLED', `Renewal of ${sub.organization_name} cancelled by ${user.email}; plan runs until ${day(sub.current_period_end)}`);
    return { status: 'cancelled', endsAt: sub.current_period_end };
  }
  await stopPaystack(sub);
  await pool.query(
    `UPDATE organization_subscriptions SET plan_code = ?, status = 'free', billing_mode = 'paystack', billing_interval = NULL, trial_ends_at = NULL,
       current_period_end = NULL, cancel_at_period_end = 0, grace_ends_at = NULL, grace_reason = NULL, amount_pesewas = NULL,
       employee_limit_override = NULL, manual_monthly_pesewas = NULL, manual_until = NULL, paused_at = NULL, paused_from = NULL,
       paystack_subscription_code = NULL, paystack_email_token = NULL, paystack_plan_code = NULL
     WHERE organization_id = ?`, [B.FREE_PLAN, organizationId]);
  await pool.query('UPDATE organizations SET plan = ? WHERE id = ?', [B.FREE_PLAN, organizationId]);
  await addNotice(pool, organizationId, 'cancelled', 'Your subscription was cancelled and the organisation is now on the Free plan. Your data is kept.', `owner-cancel:${organizationId}:${Date.now()}`);
  audit(organizationId, user.id, 'BILLING_SUBSCRIPTION_CANCELLED', `Subscription of ${sub.organization_name} cancelled now by ${user.email}; moved to Free`);
  return { status: 'free' };
}

// Pause: stops Paystack renewals; the organisation gets Free entitlements (data kept) until resumed
async function pauseSubscription(organizationId, body, user) {
  const sub = await ownerSub(organizationId);
  if (sub.status === 'paused') throw new BillingError(409, 'This subscription is already paused.', 'ALREADY_PAUSED');
  if (sub.status === 'free') throw new BillingError(409, 'This organisation is on Free; there is nothing to pause.', 'ALREADY_FREE');
  await stopPaystack(sub);
  const note = String((body || {}).note || '').trim().slice(0, 255) || null;
  await pool.query(
    `UPDATE organization_subscriptions SET paused_from = status, status = 'paused', paused_at = UTC_TIMESTAMP(), note = COALESCE(?, note),
       cancel_at_period_end = IF(billing_mode = 'paystack' AND status = 'active', 1, cancel_at_period_end),
       paystack_subscription_code = NULL, paystack_email_token = NULL
     WHERE organization_id = ? AND status <> 'paused'`, [note, organizationId]);
  await addNotice(pool, organizationId, 'paused', 'Your subscription is paused by EmploCore. Paid features are switched off for now and your data is kept. Contact us to resume.', `owner-pause:${organizationId}:${Date.now()}`);
  audit(organizationId, user.id, 'BILLING_SUBSCRIPTION_PAUSED', `Subscription of ${sub.organization_name} (${sub.plan_code}, ${sub.status}) paused by ${user.email}${note ? `: ${note}` : ''}`);
  return { status: 'paused' };
}

// Resume: back to what it was if that is still valid (trial or paid period not over), otherwise a 7-day grace period
async function resumeSubscription(organizationId, user) {
  const sub = await ownerSub(organizationId);
  if (sub.status !== 'paused') throw new BillingError(409, 'This subscription is not paused.', 'NOT_PAUSED');
  const now = new Date();
  const from = sub.paused_from;
  let status = 'grace';
  if (from === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) > now) status = 'trialing';
  else if (from === 'active' && sub.billing_mode === 'manual' && (!sub.manual_until || new Date(sub.manual_until) > now)) status = 'active';
  else if (from === 'active' && sub.billing_mode === 'paystack' && sub.current_period_end && new Date(sub.current_period_end) > now) status = 'active';
  else if (from === 'grace' && sub.grace_ends_at && new Date(sub.grace_ends_at) > now) status = 'grace';
  const graceEnds = status === 'grace' && !(from === 'grace' && sub.grace_ends_at && new Date(sub.grace_ends_at) > now) ? addDays(now, B.GRACE_DAYS) : null;
  await pool.query(
    `UPDATE organization_subscriptions SET status = ?, paused_at = NULL, paused_from = NULL,
       grace_ends_at = COALESCE(?, grace_ends_at), grace_reason = IF(? IS NULL, grace_reason, 'resumed')
     WHERE organization_id = ? AND status = 'paused'`, [status, graceEnds, graceEnds, organizationId]);
  audit(organizationId, user.id, 'BILLING_SUBSCRIPTION_RESUMED', `Subscription of ${sub.organization_name} resumed by ${user.email}: ${status}${graceEnds ? ` until ${day(graceEnds)}` : ''}`);
  return { status, graceEndsAt: graceEnds };
}

// Payments settings card: never returns key values, only whether they are set and which mode they are
function keyMode(key) {
  if (!key) return null;
  if (/^sk_live_|^pk_live_/.test(key)) return 'live';
  if (/^sk_test_|^pk_test_/.test(key)) return 'test';
  return 'unknown';
}

async function paymentsSettings() {
  const secret = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
  const pub = String(process.env.PAYSTACK_PUBLIC_KEY || '').trim();
  const secretMode = keyMode(secret);
  const publicMode = keyMode(pub);
  const [[hook]] = await pool.query("SELECT MAX(received_at) AS last, SUM(received_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS last30 FROM billing_events");
  const [[lastEvent]] = await pool.query('SELECT event_type, status, received_at FROM billing_events ORDER BY received_at DESC, id DESC LIMIT 1');
  const [[run]] = await pool.query('SELECT started_at, finished_at, status FROM billing_job_runs ORDER BY id DESC LIMIT 1');
  return {
    connected: Boolean(secret),
    mode: secretMode,
    secretKeySet: Boolean(secret),
    publicKeySet: Boolean(pub),
    publicKeyMode: publicMode,
    modeMismatch: Boolean(secretMode && publicMode && secretMode !== publicMode),
    webhookUrl: B.webhookUrl(),
    callbackUrl: B.callbackUrl(),
    lastWebhookAt: hook.last || null,
    webhooksLast30Days: Number(hook.last30) || 0,
    lastWebhook: lastEvent ? { type: lastEvent.event_type, status: lastEvent.status, receivedAt: lastEvent.received_at } : null,
    dailyJob: { inApp: B.inAppDailyEnabled(), lastRun: run ? { startedAt: run.started_at, finishedAt: run.finished_at, status: run.status } : null },
  };
}

module.exports = {
  BillingError, addMonths, addDays, periodEndFrom, ghs, dateText, day, addNotice, audit,
  planOut, listPlans, getPlan, ensureSubscription, getSubscription, effectivePlanCode, entitlementsFor, getEntitlements, usage,
  assertRoleCapacity, quote, discountFor, publicOffer, redeemCoupon,
  billingOverview, planStatus, startCheckout, activateCheckout, verifyCheckout, cancelRenewal, manageLink, insertPayment,
  handleWebhook, recordRenewal, sanitise, eventKey,
  updatePlan, listCoupons, updateCoupon, extendTrial, assignPlan, applyFoundingDiscount, revenueOverview, organisationBilling, subscriptionSummaries,
  endTrialNow, markPaid, cancelSubscription, pauseSubscription, resumeSubscription, paymentsSettings, keyMode, MANUAL_METHODS,
};
