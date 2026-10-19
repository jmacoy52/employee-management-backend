// Minimal Paystack REST client (https://paystack.com/docs/api/). Uses Node's built-in fetch.
// The secret key comes from PAYSTACK_SECRET_KEY and is only ever sent to api.paystack.co.
// Tests replace the transport with setTransport() so no network call is made.
const crypto = require('crypto');
const { paystackSecret } = require('../config/billing');

const BASE_URL = 'https://api.paystack.co';
const TIMEOUT_MS = 20000;

class PaystackError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PaystackError';
    this.status = status;
  }
}

async function fetchTransport(method, path, body) {
  const secret = paystackSecret();
  if (!secret) throw new PaystackError('Payments are not configured', 503);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

let transport = fetchTransport;
function setTransport(fn) { transport = fn || fetchTransport; }

async function call(method, path, body) {
  let result;
  try {
    result = await transport(method, path, body);
  } catch (err) {
    if (err instanceof PaystackError) throw err;
    throw new PaystackError(`Paystack request failed: ${err.name === 'AbortError' ? 'timed out' : err.message}`, 502);
  }
  const { status, json } = result;
  if (status >= 400 || !json || json.status === false) {
    throw new PaystackError((json && json.message) || `Paystack returned ${status}`, status >= 400 ? status : 502);
  }
  return json.data;
}

const enc = encodeURIComponent;

module.exports = {
  PaystackError,
  setTransport,
  // Plans: https://paystack.com/docs/api/plan/
  createPlan: ({ name, amount, interval, description }) =>
    call('POST', '/plan', { name, amount, interval, currency: 'GHS', description, send_invoices: true, send_sms: false }),
  // update_existing_subscriptions: the new amount applies from the next charge of subscriptions on this plan
  updatePlanAmount: (planCode, amount) =>
    call('PUT', `/plan/${enc(planCode)}`, { amount, update_existing_subscriptions: true }),
  // Transactions: https://paystack.com/docs/api/transaction/
  initializeTransaction: ({ email, amount, plan, reference, callbackUrl, metadata }) =>
    call('POST', '/transaction/initialize', { email, amount, plan, reference, callback_url: callbackUrl, currency: 'GHS', metadata }),
  verifyTransaction: (reference) => call('GET', `/transaction/verify/${enc(reference)}`),
  // Subscriptions: https://paystack.com/docs/api/subscription/
  fetchSubscription: (code) => call('GET', `/subscription/${enc(code)}`),
  disableSubscription: (code, token) => call('POST', '/subscription/disable', { code, token }),
  manageLink: (code) => call('GET', `/subscription/${enc(code)}/manage/link`),
  // Webhook signature: HMAC SHA512 of the raw request body with the secret key, hex, in x-paystack-signature
  signatureFor: (rawBody, secret = paystackSecret()) => crypto.createHmac('sha512', secret).update(rawBody).digest('hex'),
  verifySignature(rawBody, signature, secret = paystackSecret()) {
    if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
    const expected = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'), 'utf8');
    const given = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  },
};
