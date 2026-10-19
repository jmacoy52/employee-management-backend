// Billing settings (subscriptions, migration 009). Prices and limits live in the plans table (the owner edits
// them in the console); only the rules below are in code.
//   PAYSTACK_SECRET_KEY    Paystack secret key (sk_test_... / sk_live_...). Unset = payments switched off: the
//                          billing page says "Payments coming soon" and nothing else changes.
//   PAYSTACK_PUBLIC_KEY    Paystack public key; only reported to the frontend as "configured" (not needed for
//                          the redirect checkout used here).
//   PAYSTACK_CALLBACK_URL  where Paystack sends the admin after paying (default: APP_URL + /admin/billing/callback)
//   APP_URL                the frontend's address (default https://emplocore.vercel.app)
//   PAYSTACK_WEBHOOK_URL   informational only: the webhook address you entered in the Paystack dashboard. The API
//                          serves the webhook at /api/billing/paystack/webhook.

const TRIAL_PLAN = 'growth';
const FREE_PLAN = 'free';
const TRIAL_DAYS = 30;
const GRACE_DAYS = 7;
// Yearly price of an extra employee = monthly extra x 10 (the same "2 months free" as the plan prices)
const YEARLY_EXTRA_MULTIPLIER = 10;
const CURRENCY = 'GHS';
const INTERVALS = ['monthly', 'yearly'];
// Reminders: days before a trial ends / a renewal is due
const TRIAL_REMINDER_DAYS = [7, 1];
const RENEWAL_REMINDER_DAYS = [3];
// A paid period that ended this long ago without a renewal webhook is checked with Paystack, then put into grace
const RENEWAL_LEEWAY_HOURS = 24;

function paystackSecret() {
  return (process.env.PAYSTACK_SECRET_KEY || '').trim();
}

function paymentsEnabled() {
  return Boolean(paystackSecret());
}

function appUrl() {
  return (process.env.APP_URL || 'https://emplocore.vercel.app').replace(/\/+$/, '');
}

function callbackUrl() {
  return (process.env.PAYSTACK_CALLBACK_URL || `${appUrl()}/admin/billing/callback`).trim();
}

module.exports = {
  TRIAL_PLAN, FREE_PLAN, TRIAL_DAYS, GRACE_DAYS, YEARLY_EXTRA_MULTIPLIER, CURRENCY, INTERVALS,
  TRIAL_REMINDER_DAYS, RENEWAL_REMINDER_DAYS, RENEWAL_LEEWAY_HOURS,
  paystackSecret, paymentsEnabled, appUrl, callbackUrl,
};
