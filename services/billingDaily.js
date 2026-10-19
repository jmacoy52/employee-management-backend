// Daily billing job (npm run billing:daily; Render cron at 06:00 UTC). Safe to run twice:
//   - a MySQL named lock stops two runs overlapping;
//   - every state change is a conditional UPDATE (it only applies while the row is still in the old state);
//   - every reminder has a unique dedupe key, so a second run the same day sends nothing new.
// Reminders are in-app notices (billing_notices, shown as banners) plus a log line. EmploCore has no mailer yet;
// when one is added, send the e-mail where addNotice() returns true (a new notice).
const db = require('../config/db');
const paystack = require('./paystack');
const B = require('../config/billing');
const S = require('./billing');

const pool = db.promise();
const LOCK = 'emplocore_billing_daily';
const DAY = 86400000;

async function runDaily({ now = new Date(), log = console.log } = {}) {
  const conn = await pool.getConnection();
  const summary = { trialReminders: 0, trialsEnded: 0, manualEnded: 0, periodsEnded: 0, periodsSynced: 0, downgraded: 0,
    discountsEnded: 0, repriced: 0, renewalReminders: 0, checkoutsReconciled: 0, checkoutsAbandoned: 0, subscriptionsSynced: 0, errors: 0 };
  let runId = null;
  try {
    const [[{ got }]] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK]);
    if (!got) {
      log('billing:daily another run is in progress; nothing to do');
      return { skipped: true, summary };
    }
    const [run] = await pool.query("INSERT INTO billing_job_runs (status) VALUES ('running')");
    runId = run.insertId;
    const ctx = { now, log, summary, enabled: B.paymentsEnabled() };
    if (!ctx.enabled) log('billing:daily Paystack is not configured: reconciliation and price updates are skipped');
    for (const step of [trialReminders, endTrials, endManualPlans, endPaidPeriods, endGrace, endDiscounts, repriceExtras, renewalReminders, reconcileCheckouts, syncSubscriptions]) {
      try {
        await step(ctx);
      } catch (err) {
        summary.errors += 1;
        log(`billing:daily step ${step.name} failed: ${err.message}`);
      }
    }
    await pool.query("UPDATE billing_job_runs SET status = ?, finished_at = UTC_TIMESTAMP(), summary = ? WHERE id = ?",
      [summary.errors ? 'failed' : 'ok', JSON.stringify(summary).slice(0, 1000), runId]);
    log(`billing:daily done ${JSON.stringify(summary)}`);
    return { skipped: false, summary };
  } catch (err) {
    if (runId) await pool.query("UPDATE billing_job_runs SET status = 'failed', finished_at = UTC_TIMESTAMP(), summary = ? WHERE id = ?", [String(err.message).slice(0, 1000), runId]).catch(() => {});
    throw err;
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]).catch(() => {});
    conn.release();
  }
}

// Runs fn for each row; a failure on one organisation is logged and the rest continue
async function each(ctx, rows, fn) {
  for (const row of rows) {
    try {
      await fn(row);
    } catch (err) {
      ctx.summary.errors += 1;
      ctx.log(`billing:daily organisation ${row.organization_id}: ${err.message}`);
    }
  }
}

async function notice(ctx, orgId, kind, message, key) {
  const added = await S.addNotice(pool, orgId, kind, message, key);
  if (added) ctx.log(`billing:daily notice ${kind} for organisation ${orgId} (in-app; no mailer configured)`);
  return added;
}

// 1. Trial ending reminders (7 days and 1 day before)
async function trialReminders(ctx) {
  const [rows] = await pool.query(
    `SELECT s.organization_id, s.trial_ends_at, p.name AS plan_name FROM organization_subscriptions s JOIN plans p ON p.code = s.plan_code
     WHERE s.status = 'trialing' AND s.billing_mode = 'paystack' AND s.trial_ends_at > ? AND s.trial_ends_at <= ?`,
    [ctx.now, new Date(ctx.now.getTime() + Math.max(...B.TRIAL_REMINDER_DAYS) * DAY)]
  );
  await each(ctx, rows, async (r) => {
    const daysLeft = Math.ceil((new Date(r.trial_ends_at) - ctx.now) / DAY);
    const threshold = [...B.TRIAL_REMINDER_DAYS].sort((a, b) => a - b).find((t) => daysLeft <= t);
    const msg = `Your ${r.plan_name} trial ends on ${S.dateText(r.trial_ends_at)}. Choose a plan on the Billing page to keep payroll and your other features; otherwise the organisation moves to the Free plan after a ${B.GRACE_DAYS}-day grace period. Your data is kept.`;
    if (await notice(ctx, r.organization_id, 'trial_ending', msg, `trial:${r.organization_id}:${S.day(r.trial_ends_at)}:${threshold}`)) ctx.summary.trialReminders += 1;
  });
}

// 2. Trials that ended: grace period starts
async function endTrials(ctx) {
  const [rows] = await pool.query(
    "SELECT organization_id, trial_ends_at FROM organization_subscriptions WHERE status = 'trialing' AND billing_mode = 'paystack' AND trial_ends_at <= ?",
    [ctx.now]
  );
  await each(ctx, rows, async (r) => {
    const graceEnds = S.addDays(new Date(r.trial_ends_at), B.GRACE_DAYS);
    const [u] = await pool.query(
      "UPDATE organization_subscriptions SET status = 'grace', grace_reason = 'trial_ended', grace_ends_at = ? WHERE organization_id = ? AND status = 'trialing' AND trial_ends_at <= ?",
      [graceEnds, r.organization_id, ctx.now]
    );
    if (!u.affectedRows) return;
    ctx.summary.trialsEnded += 1;
    S.audit(r.organization_id, null, 'BILLING_TRIAL_ENDED', `Trial ended; grace period until ${S.day(graceEnds)}`);
    await notice(ctx, r.organization_id, 'grace', `Your free trial has ended. Choose a plan by ${S.dateText(graceEnds)} to keep your features; after that the organisation moves to the Free plan. Your data is kept.`, `grace:trial:${r.organization_id}:${S.day(r.trial_ends_at)}`);
  });
}

// 3. Owner-assigned plans with an end date that has passed: grace period starts
async function endManualPlans(ctx) {
  const [rows] = await pool.query(
    "SELECT organization_id, manual_until FROM organization_subscriptions WHERE status = 'active' AND billing_mode = 'manual' AND manual_until IS NOT NULL AND manual_until <= ?",
    [ctx.now]
  );
  await each(ctx, rows, async (r) => {
    const graceEnds = S.addDays(new Date(r.manual_until), B.GRACE_DAYS);
    const [u] = await pool.query(
      "UPDATE organization_subscriptions SET status = 'grace', grace_reason = 'subscription_ended', grace_ends_at = ? WHERE organization_id = ? AND status = 'active' AND billing_mode = 'manual' AND manual_until <= ?",
      [graceEnds, r.organization_id, ctx.now]
    );
    if (!u.affectedRows) return;
    ctx.summary.manualEnded += 1;
    S.audit(r.organization_id, null, 'BILLING_PLAN_ENDED', `Assigned plan ended; grace period until ${S.day(graceEnds)}`);
    await notice(ctx, r.organization_id, 'grace', `Your plan ended on ${S.dateText(r.manual_until)}. Choose a plan by ${S.dateText(graceEnds)} to keep your features; after that the organisation moves to the Free plan. Your data is kept.`, `grace:manual:${r.organization_id}:${S.day(r.manual_until)}`);
  });
}

// 4. Paid periods that ended without a renewal: check Paystack, then grace
async function endPaidPeriods(ctx) {
  const cutoff = new Date(ctx.now.getTime() - B.RENEWAL_LEEWAY_HOURS * 3600000);
  const [rows] = await pool.query(
    `SELECT organization_id, current_period_end, cancel_at_period_end, paystack_subscription_code FROM organization_subscriptions
     WHERE status = 'active' AND billing_mode = 'paystack' AND current_period_end IS NOT NULL AND current_period_end <= ?`,
    [cutoff]
  );
  await each(ctx, rows, async (r) => {
    let reason = r.cancel_at_period_end ? 'subscription_ended' : 'payment_failed';
    if (!r.cancel_at_period_end && ctx.enabled && r.paystack_subscription_code) {
      const ps = await paystack.fetchSubscription(r.paystack_subscription_code);
      const next = ps.next_payment_date ? new Date(ps.next_payment_date) : null;
      if (ps.status === 'active' && next && next > ctx.now) {
        // Paystack renewed it (the webhook was missed): follow Paystack's date
        await pool.query("UPDATE organization_subscriptions SET current_period_end = ? WHERE organization_id = ? AND status = 'active'", [next, r.organization_id]);
        ctx.summary.periodsSynced += 1;
        ctx.log(`billing:daily organisation ${r.organization_id} renewal confirmed by Paystack until ${S.day(next)}`);
        return;
      }
      if (['non-renewing', 'cancelled', 'complete'].includes(ps.status)) reason = 'subscription_ended';
    }
    const graceEnds = S.addDays(ctx.now, B.GRACE_DAYS);
    const [u] = await pool.query(
      "UPDATE organization_subscriptions SET status = 'grace', grace_reason = ?, grace_ends_at = ? WHERE organization_id = ? AND status = 'active' AND billing_mode = 'paystack' AND current_period_end <= ?",
      [reason, graceEnds, r.organization_id, cutoff]
    );
    if (!u.affectedRows) return;
    ctx.summary.periodsEnded += 1;
    S.audit(r.organization_id, null, 'BILLING_PERIOD_ENDED', `Paid period ended without renewal (${reason}); grace period until ${S.day(graceEnds)}`);
    await notice(ctx, r.organization_id, 'grace', reason === 'payment_failed'
      ? `We could not renew your subscription. Update your card or choose a plan by ${S.dateText(graceEnds)}; after that the organisation moves to the Free plan. Your data is kept.`
      : `Your subscription has ended. Choose a plan by ${S.dateText(graceEnds)} to keep your features; after that the organisation moves to the Free plan. Your data is kept.`,
    `grace:period:${r.organization_id}:${S.day(r.current_period_end)}`);
  });
}

// 5. Grace periods that are over: move to Free (no data is deleted)
async function endGrace(ctx) {
  const [rows] = await pool.query(
    "SELECT organization_id, plan_code, paystack_subscription_code, paystack_email_token FROM organization_subscriptions WHERE status = 'grace' AND grace_ends_at <= ?",
    [ctx.now]
  );
  await each(ctx, rows, async (r) => {
    if (ctx.enabled && r.paystack_subscription_code && r.paystack_email_token) {
      await paystack.disableSubscription(r.paystack_subscription_code, r.paystack_email_token)
        .catch((err) => ctx.log(`billing:daily could not disable Paystack subscription for organisation ${r.organization_id}: ${err.message}`));
    }
    const [u] = await pool.query(
      `UPDATE organization_subscriptions SET plan_code = ?, status = 'free', billing_mode = 'paystack', billing_interval = NULL,
         current_period_end = NULL, cancel_at_period_end = 0, grace_ends_at = NULL, grace_reason = NULL, amount_pesewas = NULL,
         extra_employees_billed = 0, discount_coupon = NULL, discount_percent = NULL, discount_ends_at = NULL,
         employee_limit_override = NULL, manual_monthly_pesewas = NULL, manual_until = NULL,
         paystack_subscription_code = NULL, paystack_email_token = NULL, paystack_plan_code = NULL
       WHERE organization_id = ? AND status = 'grace' AND grace_ends_at <= ?`,
      [B.FREE_PLAN, r.organization_id, ctx.now]
    );
    if (!u.affectedRows) return;
    await pool.query('UPDATE organizations SET plan = ? WHERE id = ?', [B.FREE_PLAN, r.organization_id]);
    ctx.summary.downgraded += 1;
    S.audit(r.organization_id, null, 'BILLING_DOWNGRADED', `Moved from ${r.plan_code} to Free after the grace period (no data deleted)`);
    await notice(ctx, r.organization_id, 'downgraded', 'Your organisation is now on the Free plan. All your data is kept: payslips and records above the Free limits are read-only. Upgrade at any time to unlock them again.', `downgraded:${r.organization_id}:${S.day(ctx.now)}`);
  });
}

// 6. Discounts that ran out: the subscription goes back to the full price from the next charge
async function endDiscounts(ctx) {
  const [rows] = await pool.query(
    `SELECT s.*, p.name AS plan_name FROM organization_subscriptions s JOIN plans p ON p.code = s.plan_code
     WHERE s.discount_percent IS NOT NULL AND s.discount_ends_at <= ?`, [ctx.now]
  );
  await each(ctx, rows, async (s) => {
    let amount = s.amount_pesewas;
    if (s.billing_mode === 'paystack' && s.status === 'active' && s.billing_interval) {
      const plan = await S.getPlan(s.plan_code);
      amount = S.quote(plan, s.billing_interval, (plan.included_employees || 0) + s.extra_employees_billed, 0).total;
      if (!ctx.enabled) return; // cannot change the Paystack price; try again once Paystack is configured
      if (s.paystack_plan_code) await paystack.updatePlanAmount(s.paystack_plan_code, amount);
    }
    const [u] = await pool.query(
      'UPDATE organization_subscriptions SET discount_coupon = NULL, discount_percent = NULL, discount_ends_at = NULL, amount_pesewas = ? WHERE organization_id = ? AND discount_ends_at <= ?',
      [amount, s.organization_id, ctx.now]
    );
    if (!u.affectedRows) return;
    ctx.summary.discountsEnded += 1;
    S.audit(s.organization_id, null, 'BILLING_DISCOUNT_ENDED', `Founding discount ended; next charge ${S.ghs(amount)}`);
    if (amount) await notice(ctx, s.organization_id, 'discount_ended', `Your founding discount has ended. From your next renewal, ${s.plan_name} costs ${S.ghs(amount)} per ${s.billing_interval === 'yearly' ? 'year' : 'month'}.`, `discount_end:${s.organization_id}:${S.day(s.discount_ends_at)}`);
  });
}

// 7. Extra employees: the next renewal follows the number of employees above the plan's allowance
async function repriceExtras(ctx) {
  if (!ctx.enabled) return;
  const [rows] = await pool.query(
    `SELECT s.*, (SELECT COUNT(*) FROM employees e WHERE e.organization_id = s.organization_id) AS employees
     FROM organization_subscriptions s JOIN plans p ON p.code = s.plan_code
     WHERE s.status = 'active' AND s.billing_mode = 'paystack' AND s.cancel_at_period_end = 0 AND s.paystack_plan_code IS NOT NULL
       AND s.billing_interval IS NOT NULL AND p.extra_employee_pesewas IS NOT NULL AND p.included_employees IS NOT NULL`
  );
  await each(ctx, rows, async (s) => {
    const plan = await S.getPlan(s.plan_code);
    const q = S.quote(plan, s.billing_interval, Number(s.employees), s.discount_percent || 0);
    if (q.extras === s.extra_employees_billed && q.total === s.amount_pesewas) return;
    await paystack.updatePlanAmount(s.paystack_plan_code, q.total);
    const [u] = await pool.query(
      'UPDATE organization_subscriptions SET amount_pesewas = ?, extra_employees_billed = ? WHERE organization_id = ? AND paystack_plan_code = ?',
      [q.total, q.extras, s.organization_id, s.paystack_plan_code]
    );
    if (!u.affectedRows) return;
    ctx.summary.repriced += 1;
    S.audit(s.organization_id, null, 'BILLING_REPRICED', `Next renewal ${S.ghs(q.total)} (${q.extras} extra employees)`);
    await notice(ctx, s.organization_id, 'repriced', `From your next renewal${s.current_period_end ? ` on ${S.dateText(s.current_period_end)}` : ''} you will pay ${S.ghs(q.total)} (${plan.name}${q.extras ? ` + ${q.extras} extra employee${q.extras === 1 ? '' : 's'}` : ''}).`, `reprice:${s.organization_id}:${q.total}:${S.day(s.current_period_end)}`);
  });
}

// 8. Renewal reminders (3 days before), or "ends on" when the renewal was cancelled
async function renewalReminders(ctx) {
  const [rows] = await pool.query(
    `SELECT s.organization_id, s.current_period_end, s.cancel_at_period_end, s.amount_pesewas, s.billing_interval, p.name AS plan_name
     FROM organization_subscriptions s JOIN plans p ON p.code = s.plan_code
     WHERE s.status = 'active' AND s.billing_mode = 'paystack' AND s.current_period_end > ? AND s.current_period_end <= ?`,
    [ctx.now, new Date(ctx.now.getTime() + Math.max(...B.RENEWAL_REMINDER_DAYS) * DAY)]
  );
  await each(ctx, rows, async (r) => {
    const msg = r.cancel_at_period_end
      ? `Your ${r.plan_name} plan ends on ${S.dateText(r.current_period_end)} and will not renew. Choose a plan on the Billing page to keep it.`
      : `Your ${r.plan_name} plan renews on ${S.dateText(r.current_period_end)} for ${S.ghs(r.amount_pesewas)}.`;
    if (await notice(ctx, r.organization_id, 'renewal', msg, `renewal:${r.organization_id}:${S.day(r.current_period_end)}:${r.cancel_at_period_end ? 'end' : 'renew'}`)) ctx.summary.renewalReminders += 1;
  });
}

// 9. Payments that were started but never confirmed (closed tab, missed webhook): ask Paystack
async function reconcileCheckouts(ctx) {
  const [stale] = await pool.query(
    "SELECT reference FROM billing_checkouts WHERE status = 'pending' AND created_at <= ? ",
    [new Date(ctx.now.getTime() - 2 * DAY)]
  );
  await each(ctx, stale, async (c) => {
    if (ctx.enabled) {
      const tx = await paystack.verifyTransaction(c.reference).catch(() => null);
      if (tx && tx.status === 'success') {
        await S.activateCheckout(c.reference, tx, { source: 'daily' });
        ctx.summary.checkoutsReconciled += 1;
        return;
      }
    }
    const [u] = await pool.query("UPDATE billing_checkouts SET status = 'abandoned', completed_at = UTC_TIMESTAMP() WHERE reference = ? AND status = 'pending'", [c.reference]);
    if (u.affectedRows) ctx.summary.checkoutsAbandoned += 1;
  });
  if (!ctx.enabled) return;
  const [recent] = await pool.query(
    "SELECT reference FROM billing_checkouts WHERE status = 'pending' AND created_at > ? AND created_at <= ?",
    [new Date(ctx.now.getTime() - 2 * DAY), new Date(ctx.now.getTime() - 30 * 60000)]
  );
  await each(ctx, recent, async (c) => {
    const tx = await paystack.verifyTransaction(c.reference).catch(() => null);
    if (!tx || tx.status === 'ongoing' || tx.status === 'pending') return;
    const r = await S.activateCheckout(c.reference, tx, { source: 'daily' });
    if (r.status === 'activated') ctx.summary.checkoutsReconciled += 1;
  });
}

// 10. Keep active subscriptions in step with Paystack (cancelled on Paystack's side, new renewal date)
async function syncSubscriptions(ctx) {
  if (!ctx.enabled) return;
  const [rows] = await pool.query(
    `SELECT organization_id, paystack_subscription_code, current_period_end, cancel_at_period_end FROM organization_subscriptions
     WHERE status = 'active' AND billing_mode = 'paystack' AND paystack_subscription_code IS NOT NULL LIMIT 500`
  );
  await each(ctx, rows, async (r) => {
    const ps = await paystack.fetchSubscription(r.paystack_subscription_code);
    const next = ps.next_payment_date ? new Date(ps.next_payment_date) : null;
    const ending = ['non-renewing', 'cancelled', 'complete'].includes(ps.status) ? 1 : r.cancel_at_period_end;
    const period = next && (!r.current_period_end || next > new Date(r.current_period_end)) && ps.status === 'active' ? next : r.current_period_end;
    if (ending === r.cancel_at_period_end && String(period) === String(r.current_period_end)) return;
    await pool.query('UPDATE organization_subscriptions SET cancel_at_period_end = ?, current_period_end = ? WHERE organization_id = ? AND paystack_subscription_code = ?',
      [ending, period, r.organization_id, r.paystack_subscription_code]);
    ctx.summary.subscriptionsSynced += 1;
  });
}

module.exports = { runDaily, LOCK };
