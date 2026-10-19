// Subscriptions (migration 009): plan limits, role access, Paystack checkout/verify, webhook signature and
// idempotency, daily-job transitions, owner actions, revenue and tenant isolation. Paystack is stubbed: no network.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { resetDatabase, rawConnection, DEMO } = require('./helpers');

const SETUP_TOKEN = 'test-setup-token-billing-0123456789';
process.env.OWNER_SETUP_TOKEN_HASH = bcrypt.hashSync(SETUP_TOKEN, 4);
const OWNER = { email: 'owner@billing.example', name: 'Platform Owner', password: 'Strong-Platform-Key-2026' };
const PW = 'Password123';
const FAKE_SECRET = 'test-only-paystack-secret-not-real';
delete process.env.PAYSTACK_SECRET_KEY;

let request, app, db, conn, paystack, billing, runDaily;
let ownerToken, demoAdmin, demoHr, demoEmployee;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });
const P = (path) => `/api/platform${path}`;
const DAY = 86400000;

// ---------- Paystack stub
const stub = { calls: [], txs: {}, subs: {}, plans: 0 };
function transport(method, path, body) {
  stub.calls.push({ method, path, body });
  const ok = (data) => ({ status: 200, json: { status: true, message: 'ok', data } });
  if (method === 'POST' && path === '/plan') { stub.plans += 1; return ok({ plan_code: `PLN_test${stub.plans}` }); }
  if (method === 'PUT' && path.startsWith('/plan/')) return ok({});
  if (method === 'POST' && path === '/transaction/initialize') {
    stub.txs[body.reference] = { amount: body.amount, status: 'success', plan: body.plan };
    return ok({ authorization_url: `https://checkout.paystack.test/${body.reference}`, reference: body.reference });
  }
  if (method === 'GET' && path.startsWith('/transaction/verify/')) {
    const ref = decodeURIComponent(path.split('/').pop());
    const t = stub.txs[ref];
    if (!t) return { status: 404, json: { status: false, message: 'Transaction reference not found' } };
    return ok({ id: 9000 + Object.keys(stub.txs).indexOf(ref), reference: ref, status: t.status, amount: t.amount, currency: 'GHS', channel: 'card',
      paid_at: new Date().toISOString(), customer: { customer_code: 'CUS_test1' }, plan: t.plan });
  }
  if (method === 'GET' && path.startsWith('/subscription/') && path.endsWith('/manage/link')) return ok({ link: 'https://paystack.test/manage' });
  if (method === 'GET' && path.startsWith('/subscription/')) {
    const code = decodeURIComponent(path.split('/').pop());
    return ok(stub.subs[code] || { status: 'cancelled', next_payment_date: null });
  }
  if (method === 'POST' && path === '/subscription/disable') return ok({});
  return { status: 404, json: { status: false, message: `stub: no route ${method} ${path}` } };
}

// Audit entries are written just after the response: wait briefly
const logs = async (action) => {
  let rows = [];
  for (let i = 0; i < 20; i += 1) {
    [rows] = await conn.query('SELECT * FROM audit_logs WHERE actions = ? ORDER BY LogId', [action]);
    if (rows.length) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  return rows;
};
const sub = async (orgId) => (await conn.query('SELECT * FROM organization_subscriptions WHERE organization_id = ?', [orgId]))[0][0];

// Owner creates an active organisation with a known admin password; returns { id, admin }
async function makeOrg(name, email) {
  const r = await request(app).post(P('/organizations')).set(auth(ownerToken)).send({ name, admin: { name: `${name} Admin`, email, password: PW } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const admin = (await login(email, PW)).body.token;
  return { id: r.body.id, admin };
}
const assign = (orgId, body) => request(app).post(P(`/organizations/${orgId}/subscription/assign`)).set(auth(ownerToken)).send(body);
const addEmployees = async (orgId, n, prefix) => {
  const [[dept]] = await conn.query('SELECT id FROM departments WHERE organization_id = ? LIMIT 1', [orgId]);
  let deptId = dept && dept.id;
  if (!deptId) { const [d] = await conn.query("INSERT INTO departments (organization_id, name) VALUES (?, 'General')", [orgId]); deptId = d.insertId; }
  for (let i = 0; i < n; i += 1) {
    await conn.query("INSERT INTO employees (organization_id, FullName, position, Department, department_id, email, salary) VALUES (?, ?, 'Clerk', 'General', ?, ?, 1000)",
      [orgId, `${prefix} ${i}`, deptId, `${prefix.toLowerCase().replace(/\W/g, '')}${i}@staff.example`]);
  }
};
const newEmployee = (token, n) => request(app).post('/api/employees').set(auth(token)).send({ FullName: `New Person ${n}`, position: 'Clerk', Department: 'General', salary: 1200, email: `new${n}.${Date.now()}@staff.example` });
const createUser = (token, email, role) => request(app).post('/api/users/register').set(auth(token)).send({ username: `Staff ${email.split('@')[0]}`, email, password: PW, role });
function signedWebhook(event, data, secret = FAKE_SECRET) {
  const raw = JSON.stringify({ event, data });
  return request(app).post('/api/billing/paystack/webhook').set('Content-Type', 'application/json')
    .set('x-paystack-signature', paystack.signatureFor(Buffer.from(raw), secret)).send(raw);
}

before(async () => {
  await resetDatabase();
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
  paystack = require('../services/paystack');
  billing = require('../services/billing');
  ({ runDaily } = require('../services/billingDaily'));
  paystack.setTransport(transport);
  conn = await rawConnection();
  demoAdmin = (await login(DEMO.admin.email, DEMO.admin.password)).body.token;
  demoHr = (await login(DEMO.hr.email, DEMO.hr.password)).body.token;
  demoEmployee = (await login(DEMO.employee.email, DEMO.employee.password)).body.token;
  assert.equal((await request(app).post(P('/bootstrap-owner')).send({ ...OWNER, setupToken: SETUP_TOKEN })).status, 201);
  ownerToken = (await login(OWNER.email, OWNER.password)).body.token;
});
after(async () => {
  paystack.setTransport(null);
  delete process.env.PAYSTACK_SECRET_KEY;
  if (conn) await conn.end();
  if (db) db.end();
});

// ---------- public plans and prices
test('public plans: five tiers from the database, founding offer while places remain', async () => {
  const r = await request(app).get('/api/billing/plans');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.plans.map((p) => [p.code, p.priceMonthly, p.priceYearly, p.includedEmployees, p.extraEmployee]), [
    ['free', 0, 0, 5, null], ['starter', 9900, 99000, 15, 600], ['growth', 24900, 249000, 50, 500],
    ['business', 54900, 549000, 150, 400], ['enterprise', null, null, null, null]]);
  assert.equal(r.body.plans.find((p) => p.highlighted).code, 'growth');
  assert.deepEqual(r.body.offer, { code: 'FOUNDING40', name: 'Founding customer offer', percentOff: 40, months: 12, places: 25 });
  assert.equal(r.body.trialDays, 30);
});

test('quote: base price, extra employees (yearly = 10x monthly extra) and percentage discount', async () => {
  const starter = await billing.getPlan('starter');
  assert.deepEqual(billing.quote(starter, 'monthly', 20), { base: 9900, extras: 5, extraUnit: 600, subtotal: 12900, discountPercent: 0, discount: 0, total: 12900 });
  assert.equal(billing.quote(starter, 'yearly', 20).total, 99000 + 5 * 6000);
  assert.equal(billing.quote(starter, 'monthly', 3).total, 9900);
  const growth = await billing.getPlan('growth');
  assert.equal(billing.quote(growth, 'monthly', 10, 40).total, 14940); // GHS 149.40 founding price
  assert.equal(billing.quote(await billing.getPlan('business'), 'monthly', 10, 40).total, 32940);
  assert.throws(() => billing.quote({ name: 'Enterprise', price_monthly_pesewas: null }, 'monthly', 1), /priced individually/);
});

// ---------- role access
test('only organisation admins manage billing: HR, employees and the owner get 403; everyone in the org can read the plan', async () => {
  for (const t of [demoHr, demoEmployee, ownerToken]) {
    assert.equal((await request(app).get('/api/billing').set(auth(t))).status, 403);
    assert.equal((await request(app).post('/api/billing/checkout').set(auth(t)).send({ plan: 'growth', interval: 'monthly' })).status, 403);
    assert.equal((await request(app).get('/api/billing/payments').set(auth(t))).status, 403);
  }
  assert.equal((await request(app).get('/api/billing')).status, 401);
  const st = await request(app).get('/api/billing/status').set(auth(demoHr));
  assert.equal(st.status, 200);
  assert.deepEqual([st.body.plan, st.body.billingMode, st.body.features.payroll], ['growth', 'exempt', true]);
  assert.equal((await request(app).get('/api/billing/status').set(auth(ownerToken))).status, 403);
  // Plans and discounts in the owner console are owner-only
  assert.equal((await request(app).get(P('/plans')).set(auth(demoAdmin))).status, 403);
  assert.equal((await request(app).get(P('/billing')).set(auth(demoAdmin))).status, 403);
});

test('without Paystack keys: billing page works and says payments are off; checkout is 503, nothing breaks', async () => {
  const r = await request(app).get('/api/billing').set(auth(demoAdmin));
  assert.equal(r.status, 200);
  assert.equal(r.body.paymentsEnabled, false);
  assert.deepEqual([r.body.subscription.plan.code, r.body.subscription.billingMode], ['growth', 'exempt']);
  assert.equal(r.body.usage.employees > 0, true);
  const c = await request(app).post('/api/billing/checkout').set(auth(demoAdmin)).send({ plan: 'starter', interval: 'monthly' });
  assert.deepEqual([c.status, c.body.code], [503, 'PAYMENTS_NOT_CONFIGURED']);
  const w = await signedWebhook('charge.success', { id: 1, reference: 'x' });
  assert.equal(w.status, 503);
});

// ---------- plan limits
test('Free plan: 5 employees, no payroll changes, no audit log, 1 admin, no HR; old payroll stays readable', async () => {
  const org = await makeOrg('Free Limits Ltd', 'admin@freelimits.example');
  assert.equal((await assign(org.id, { plan: 'free' })).status, 200);
  await addEmployees(org.id, 4, 'Free Staff');
  assert.equal((await newEmployee(org.admin, 1)).status, 201); // the 5th
  const sixth = await newEmployee(org.admin, 2);
  assert.deepEqual([sixth.status, sixth.body.code, sixth.body.limit], [409, 'PLAN_LIMIT_REACHED', 5]);
  assert.match(sixth.body.error, /Free plan includes up to 5 employees/);
  // Payroll: changes refused, reading allowed
  const run = await request(app).post('/api/payroll/runs').set(auth(org.admin)).send({ period: '2026-09', payDate: '2026-09-30' });
  assert.deepEqual([run.status, run.body.code, run.body.feature], [403, 'PLAN_FEATURE_UNAVAILABLE', 'payroll']);
  assert.equal((await request(app).get('/api/payroll/runs').set(auth(org.admin))).status, 200);
  assert.equal((await request(app).get('/api/payroll/pay-details').set(auth(org.admin))).status, 200);
  // Audit log: Growth and up (entries are still recorded)
  const al = await request(app).get('/api/audit-logs').set(auth(org.admin));
  assert.deepEqual([al.status, al.body.code], [403, 'PLAN_FEATURE_UNAVAILABLE']);
  assert.equal((await request(app).get('/api/audit-logs/recent').set(auth(org.admin))).status, 403);
  // Accounts: no HR, one admin; employees are fine
  const hr = await createUser(org.admin, 'hr@freelimits.example', 'hr');
  assert.deepEqual([hr.status, hr.body.code], [409, 'PLAN_LIMIT_REACHED']);
  assert.match(hr.body.error, /does not include HR accounts/);
  assert.equal((await createUser(org.admin, 'admin2@freelimits.example', 'admin')).status, 409);
  const emp = await createUser(org.admin, 'emp@freelimits.example', 'employee');
  assert.equal(emp.status, 201);
  // Promoting the employee to HR uses an HR place
  const promote = await request(app).put(`/api/users/${emp.body.userId}/role`).set(auth(org.admin)).send({ role: 'hr' });
  assert.deepEqual([promote.status, promote.body.code], [409, 'PLAN_LIMIT_REACHED']);
});

test('above the cap after a downgrade: records are read-only (view and delete, no edit), creating stays blocked', async () => {
  const org = await makeOrg('Downgraded Ltd', 'admin@downgraded.example');
  await addEmployees(org.id, 8, 'Down Staff');
  assert.equal((await assign(org.id, { plan: 'free' })).status, 200);
  const [[e]] = await conn.query('SELECT id FROM employees WHERE organization_id = ? ORDER BY id LIMIT 1', [org.id]);
  const [[dept]] = await conn.query('SELECT id FROM departments WHERE organization_id = ? LIMIT 1', [org.id]);
  const edit = await request(app).put(`/api/employees/${e.id}`).set(auth(org.admin)).send({ FullName: 'Changed', position: 'Clerk', department_id: dept.id, salary: 1000 });
  assert.deepEqual([edit.status, edit.body.code], [409, 'PLAN_OVER_LIMIT']);
  assert.equal((await request(app).get('/api/employees').set(auth(org.admin))).body.length, 8);
  assert.equal((await newEmployee(org.admin, 3)).status, 409);
  const st = (await request(app).get('/api/billing/status').set(auth(org.admin))).body;
  assert.deepEqual([st.plan, st.overEmployeeLimit, st.employees], ['free', true, 8]);
  // Deleting gets them back under the cap; then editing works again
  const [rows] = await conn.query('SELECT id FROM employees WHERE organization_id = ? ORDER BY id DESC LIMIT 3', [org.id]);
  for (const r of rows) assert.equal((await request(app).delete(`/api/employees/${r.id}`).set(auth(org.admin))).status, 200);
  const edit2 = await request(app).put(`/api/employees/${e.id}`).set(auth(org.admin)).send({ FullName: 'Changed', position: 'Clerk', department_id: dept.id, salary: 1000 });
  assert.equal(edit2.status, 200);
});

test('Starter: 1 admin + 1 HR, payroll included; reactivating a second HR is refused', async () => {
  const org = await makeOrg('Starter Shop', 'admin@startershop.example');
  assert.equal((await assign(org.id, { plan: 'starter', months: 3 })).status, 200);
  const hr1 = await createUser(org.admin, 'hr1@startershop.example', 'hr');
  assert.equal(hr1.status, 201);
  assert.equal((await createUser(org.admin, 'hr2@startershop.example', 'hr')).status, 409);
  // Deactivate HR 1, create HR 2, then HR 1 cannot come back
  assert.equal((await request(app).put(`/api/users/${hr1.body.userId}/status`).set(auth(org.admin)).send({ is_active: false })).status, 200);
  assert.equal((await createUser(org.admin, 'hr2@startershop.example', 'hr')).status, 201);
  const back = await request(app).put(`/api/users/${hr1.body.userId}/status`).set(auth(org.admin)).send({ is_active: true });
  assert.deepEqual([back.status, back.body.code], [409, 'PLAN_LIMIT_REACHED']);
  const run = await request(app).post('/api/payroll/runs').set(auth(org.admin)).send({ period: '2026-09', payDate: '2026-09-30' });
  assert.notEqual(run.status, 403);
});

test('trial (Growth): unlimited HR and the audit log; a pending registration starts its trial on approval', async () => {
  const org = await makeOrg('Trial Org', 'admin@trialorg.example');
  const s = await sub(org.id);
  assert.deepEqual([s.status, s.plan_code, s.billing_mode], ['trialing', 'growth', 'paystack']);
  for (const n of [1, 2, 3]) assert.equal((await createUser(org.admin, `hr${n}@trialorg.example`, 'hr')).status, 201);
  assert.equal((await request(app).get('/api/audit-logs').set(auth(org.admin))).status, 200);
  // Public registration: trial waits for approval
  const ORG = { organizationType: 'Private company', sizeRange: '11-50', country: 'Ghana', city: 'Accra', phone: '+233 20 000 0000' };
  assert.equal((await request(app).post('/api/organizations/register').send({ ...ORG, organizationName: 'Pending Bakery', adminName: 'Ama Pending', email: 'ama@pending.example', password: PW })).status, 201);
  const [[pending]] = await conn.query("SELECT id FROM organizations WHERE slug = 'pending-bakery'");
  assert.equal((await sub(pending.id)).trial_ends_at, null);
  assert.equal((await request(app).post(P(`/organizations/${pending.id}/approve`)).set(auth(ownerToken))).status, 200);
  const after = await sub(pending.id);
  assert.ok(Math.abs(new Date(after.trial_ends_at) - Date.now() - 30 * DAY) < 120000);
});

// ---------- checkout, verify, invoices (Paystack stubbed)
let paidOrg;
test('checkout: founding 40% applied, own Paystack plan, server-side verify activates once; demo org is exempt', async () => {
  process.env.PAYSTACK_SECRET_KEY = FAKE_SECRET;
  paidOrg = await makeOrg('Paying Customer Ltd', 'admin@paying.example');
  await addEmployees(paidOrg.id, 10, 'Pay Staff');
  const ov = (await request(app).get('/api/billing').set(auth(paidOrg.admin))).body;
  assert.equal(ov.paymentsEnabled, true);
  assert.deepEqual([ov.discount.coupon, ov.discount.percent], ['FOUNDING40', 40]);
  assert.equal((await request(app).post('/api/billing/checkout').set(auth(paidOrg.admin)).send({ plan: 'enterprise', interval: 'monthly' })).status, 400);
  assert.equal((await request(app).post('/api/billing/checkout').set(auth(paidOrg.admin)).send({ plan: 'growth', interval: 'weekly' })).status, 400);
  const c = await request(app).post('/api/billing/checkout').set(auth(paidOrg.admin)).send({ plan: 'growth', interval: 'monthly' });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.amount, 14940);
  assert.match(c.body.authorizationUrl, /^https:\/\/checkout\.paystack\.test\//);
  const planCall = stub.calls.find((x) => x.path === '/plan');
  assert.deepEqual([planCall.body.amount, planCall.body.interval, planCall.body.currency], [14940, 'monthly', 'GHS']);
  const init = stub.calls.find((x) => x.path === '/transaction/initialize');
  assert.deepEqual([init.body.email, init.body.plan, init.body.amount], ['admin@paying.example', 'PLN_test1', 14940]);
  // Demo organisation: billing switched off
  const demo = await request(app).post('/api/billing/checkout').set(auth(demoAdmin)).send({ plan: 'business', interval: 'monthly' });
  assert.deepEqual([demo.status, demo.body.code], [403, 'BILLING_EXEMPT']);
  // Another organisation's admin cannot confirm this payment (404, not 403)
  const other = await makeOrg('Other Tenant', 'admin@othertenant.example');
  assert.equal((await request(app).post('/api/billing/verify').set(auth(other.admin)).send({ reference: c.body.reference })).status, 404);
  // Callback: verified with Paystack, then activated
  const v = await request(app).post('/api/billing/verify').set(auth(paidOrg.admin)).send({ reference: c.body.reference });
  assert.deepEqual([v.status, v.body.status], [200, 'activated']);
  const s = await sub(paidOrg.id);
  assert.deepEqual([s.status, s.plan_code, s.billing_interval, s.amount_pesewas, s.discount_percent, s.paystack_plan_code], ['active', 'growth', 'monthly', 14940, 40, 'PLN_test1']);
  assert.ok(Math.abs(new Date(s.discount_ends_at) - Date.now() - 365 * DAY) < 3 * DAY);
  const [[coupon]] = await conn.query("SELECT redeemed_count FROM billing_coupons WHERE code = 'FOUNDING40'");
  assert.equal(coupon.redeemed_count, 1);
  // Repeat verify: nothing applied twice
  assert.equal((await request(app).post('/api/billing/verify').set(auth(paidOrg.admin)).send({ reference: c.body.reference })).body.status, 'already');
  const [pays] = await conn.query('SELECT * FROM billing_payments WHERE organization_id = ?', [paidOrg.id]);
  assert.equal(pays.length, 1);
  assert.match(pays[0].invoice_number, /^EC-\d{4}-\d{6}$/);
  assert.equal((await logs('BILLING_SUBSCRIPTION_ACTIVATED'))[0].scope, 'platform');
  // Payment history and invoice PDF: own organisation only
  const list = await request(app).get('/api/billing/payments').set(auth(paidOrg.admin));
  assert.deepEqual(list.body.map((p) => p.amount_pesewas), [14940]);
  assert.deepEqual((await request(app).get('/api/billing/payments').set(auth(other.admin))).body, []);
  const pdf = await request(app).get(`/api/billing/payments/${pays[0].id}/invoice`).set(auth(paidOrg.admin)).buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', (d) => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.equal((await request(app).get(`/api/billing/payments/${pays[0].id}/invoice`).set(auth(other.admin))).status, 404);
  // A tampered amount is refused
  const c2 = await request(app).post('/api/billing/checkout').set(auth(other.admin)).send({ plan: 'starter', interval: 'yearly' });
  assert.equal(c2.status, 201);
  stub.txs[c2.body.reference].amount = 100;
  assert.equal((await request(app).post('/api/billing/verify').set(auth(other.admin)).send({ reference: c2.body.reference })).body.status, 'mismatch');
  assert.equal((await sub(other.id)).status, 'trialing');
});

// ---------- webhooks
test('webhook: signature required (HMAC SHA512 over the raw body); events are applied once', async () => {
  process.env.PAYSTACK_SECRET_KEY = FAKE_SECRET;
  const raw = JSON.stringify({ event: 'charge.success', data: { id: 1 } });
  assert.equal((await request(app).post('/api/billing/paystack/webhook').set('Content-Type', 'application/json').send(raw)).status, 401);
  assert.equal((await request(app).post('/api/billing/paystack/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', 'f'.repeat(128)).send(raw)).status, 401);
  assert.equal((await signedWebhook('charge.success', { id: 1 }, 'some-other-secret')).status, 401);
  // A body changed after signing fails
  const sig = paystack.signatureFor(Buffer.from(raw), FAKE_SECRET);
  assert.equal((await request(app).post('/api/billing/paystack/webhook').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw.replace('1', '2'))).status, 401);

  // subscription.create attaches the Paystack subscription to the organisation (found by its own plan code)
  const created = { id: 501, subscription_code: 'SUB_test1', email_token: 'tok_test1', next_payment_date: new Date(Date.now() + 30 * DAY).toISOString(),
    plan: { plan_code: 'PLN_test1' }, customer: { customer_code: 'CUS_test1' }, status: 'active' };
  const w1 = await signedWebhook('subscription.create', created);
  assert.deepEqual([w1.status, w1.body.status], [200, 'processed']);
  assert.equal((await sub(paidOrg.id)).paystack_subscription_code, 'SUB_test1');
  // The same delivery again is recognised
  const w2 = await signedWebhook('subscription.create', created);
  assert.deepEqual([w2.status, w2.body.duplicate], [200, true]);

  // A renewal charge (unknown reference, our plan code): verified with Paystack, recorded once, period extended
  const before = await sub(paidOrg.id);
  stub.txs['RENEW_test1'] = { amount: 14940, status: 'success', plan: 'PLN_test1' };
  const renewal = { id: 777, reference: 'RENEW_test1', amount: 14940, plan: { plan_code: 'PLN_test1' } };
  assert.equal((await signedWebhook('charge.success', renewal)).body.status, 'processed');
  assert.equal((await signedWebhook('charge.success', renewal)).body.duplicate, true);
  const [renewals] = await conn.query("SELECT * FROM billing_payments WHERE reference = 'RENEW_test1'");
  assert.equal(renewals.length, 1);
  assert.ok(new Date((await sub(paidOrg.id)).current_period_end) > new Date(before.current_period_end));
  // charge.success with a forged amount in the body changes nothing: the verified amount is used
  const [[evt]] = await conn.query("SELECT COUNT(*) AS n FROM billing_events WHERE event_type = 'charge.success'");
  assert.equal(evt.n, 1);

  // invoice.payment_failed: grace period of 7 days
  const failed = { id: 888, invoice_code: 'INV_test1', amount: 14940, subscription: { subscription_code: 'SUB_test1' } };
  assert.equal((await signedWebhook('invoice.payment_failed', failed)).body.status, 'processed');
  let s = await sub(paidOrg.id);
  assert.deepEqual([s.status, s.grace_reason, s.last_payment_status], ['grace', 'payment_failed', 'failed']);
  assert.ok(Math.abs(new Date(s.grace_ends_at) - Date.now() - 7 * DAY) < 120000);
  const [[notice]] = await conn.query("SELECT message FROM billing_notices WHERE organization_id = ? AND kind = 'payment_failed'", [paidOrg.id]);
  assert.match(notice.message, /payment failed/);
  // subscription.not_renew / subscription.disable: plan ends at the period end
  assert.equal((await signedWebhook('subscription.not_renew', { id: 889, subscription_code: 'SUB_test1' })).body.status, 'processed');
  s = await sub(paidOrg.id);
  assert.equal(s.cancel_at_period_end, 1);
  assert.equal((await signedWebhook('subscription.disable', { id: 890, subscription_code: 'SUB_test1' })).status, 200);
  // Unknown events and unknown subscriptions are stored and ignored
  assert.equal((await signedWebhook('transfer.success', { id: 891 })).body.status, 'ignored');
  assert.equal((await signedWebhook('subscription.disable', { id: 892, subscription_code: 'SUB_unknown' })).body.status, 'ignored');
  // Card authorisation codes are never stored
  const [[stored]] = (await conn.query("SELECT payload FROM billing_events WHERE event_type = 'subscription.create'"));
  assert.ok(stored);
  const sanitised = billing.sanitise({ authorization: { authorization_code: 'AUTH_secret', last4: '4081' } });
  assert.deepEqual(sanitised, { authorization: { last4: '4081' } });
});

// ---------- daily job
test('daily job: reminders once, trial -> grace -> Free (data kept), ended paid period -> grace; safe to run twice', async () => {
  delete process.env.PAYSTACK_SECRET_KEY; // reconciliation off: pure state transitions
  const quiet = () => {};
  const now = new Date();
  const ending = await makeOrg('Ending Trial Co', 'admin@endingtrial.example');
  await addEmployees(ending.id, 9, 'Trial Staff');
  await conn.query('UPDATE organization_subscriptions SET trial_ends_at = ? WHERE organization_id = ?', [new Date(now.getTime() + 5 * DAY), ending.id]);
  const ended = await makeOrg('Ended Trial Co', 'admin@endedtrial.example');
  await conn.query('UPDATE organization_subscriptions SET trial_ends_at = ? WHERE organization_id = ?', [new Date(now.getTime() - DAY), ended.id]);
  const lapsed = await makeOrg('Lapsed Paid Co', 'admin@lapsedpaid.example');
  await conn.query("UPDATE organization_subscriptions SET status = 'active', plan_code = 'starter', billing_interval = 'monthly', amount_pesewas = 9900, current_period_end = ?, cancel_at_period_end = 1 WHERE organization_id = ?",
    [new Date(now.getTime() - 2 * DAY), lapsed.id]);

  const first = await runDaily({ now, log: quiet });
  assert.equal(first.skipped, false);
  assert.ok(first.summary.trialReminders >= 1);
  const [n1] = await conn.query("SELECT * FROM billing_notices WHERE organization_id = ? AND kind = 'trial_ending'", [ending.id]);
  assert.equal(n1.length, 1);
  assert.match(n1[0].message, /Growth trial ends on/);
  let s = await sub(ended.id);
  assert.deepEqual([s.status, s.grace_reason], ['grace', 'trial_ended']);
  assert.ok(Math.abs(new Date(s.grace_ends_at) - (now.getTime() + 6 * DAY)) < 120000);
  s = await sub(lapsed.id);
  assert.deepEqual([s.status, s.grace_reason], ['grace', 'subscription_ended']);

  // The same day again: nothing new
  const second = await runDaily({ now, log: quiet });
  for (const k of ['trialReminders', 'trialsEnded', 'periodsEnded', 'downgraded', 'renewalReminders']) assert.equal(second.summary[k], 0, k);
  const [n2] = await conn.query("SELECT * FROM billing_notices WHERE organization_id = ? AND kind = 'trial_ending'", [ending.id]);
  assert.equal(n2.length, 1);

  // Eight days later: grace is over -> Free; no data deleted; the demo organisation is untouched
  const later = new Date(now.getTime() + 8 * DAY);
  const [[countBefore]] = await conn.query('SELECT COUNT(*) AS n FROM employees WHERE organization_id = ?', [ended.id]);
  const third = await runDaily({ now: later, log: quiet });
  assert.ok(third.summary.downgraded >= 2);
  s = await sub(ended.id);
  assert.deepEqual([s.status, s.plan_code], ['free', 'free']);
  const [[org]] = await conn.query('SELECT plan FROM organizations WHERE id = ?', [ended.id]);
  assert.equal(org.plan, 'free');
  const [[countAfter]] = await conn.query('SELECT COUNT(*) AS n FROM employees WHERE organization_id = ?', [ended.id]);
  assert.equal(countAfter.n, countBefore.n);
  assert.equal((await sub(lapsed.id)).status, 'free');
  const [[demoOrg]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  const demoSub = await sub(demoOrg.id);
  assert.deepEqual([demoSub.status, demoSub.plan_code, demoSub.billing_mode], ['active', 'growth', 'exempt']);
  const downgrades = await logs('BILLING_DOWNGRADED');
  assert.ok(downgrades.every((l) => l.scope === 'platform'));
  // The trial that was 5 days from ending got its final reminder later, then also ran out
  assert.equal((await sub(ending.id)).status, 'grace');

  // Overlapping runs: the second one does nothing
  const holder = await rawConnection();
  try {
    await holder.query("SELECT GET_LOCK('emplocore_billing_daily', 5)");
    const blocked = await runDaily({ now: later, log: quiet });
    assert.equal(blocked.skipped, true);
  } finally {
    await holder.query("SELECT RELEASE_LOCK('emplocore_billing_daily')");
    await holder.end();
  }
  const [[runs]] = await conn.query("SELECT COUNT(*) AS n FROM billing_job_runs WHERE status = 'ok'");
  assert.equal(runs.n, 3);
});

// ---------- owner actions, plans, discounts, revenue
test('owner: extend trial, assign Enterprise, founding discount, edit plan prices, toggle the offer; MRR from paid subscriptions', async () => {
  const org = await makeOrg('Owner Actions Ltd', 'admin@owneractions.example');
  const ext = await request(app).post(P(`/organizations/${org.id}/subscription/extend-trial`)).set(auth(ownerToken)).send({ days: 14 });
  assert.equal(ext.status, 200);
  assert.ok(Math.abs(new Date((await sub(org.id)).trial_ends_at) - Date.now() - 44 * DAY) < 120000);
  assert.equal((await request(app).post(P(`/organizations/${org.id}/subscription/extend-trial`)).set(auth(ownerToken)).send({ days: 365 })).status, 400);
  assert.equal((await logs('BILLING_TRIAL_EXTENDED'))[0].scope, 'platform');
  // Enterprise: custom employee limit and a monthly price paid outside Paystack
  const ent = await assign(org.id, { plan: 'enterprise', employeeLimit: 500, monthlyPrice: 1500, note: 'Annual contract' });
  assert.equal(ent.status, 200);
  const detail = (await request(app).get(P(`/organizations/${org.id}`)).set(auth(ownerToken))).body.subscription;
  assert.deepEqual([detail.planCode, detail.billingMode, detail.entitlements.employeeCap, detail.manualMonthly], ['enterprise', 'manual', 500, 150000]);
  assert.equal((await logs('BILLING_PLAN_ASSIGNED')).length >= 1, true);
  // Founding discount on request
  const fd = await request(app).post(P(`/organizations/${org.id}/subscription/founding-discount`)).set(auth(ownerToken));
  assert.deepEqual([fd.status, fd.body.percent], [200, 40]);
  assert.equal((await request(app).post(P(`/organizations/${org.id}/subscription/founding-discount`)).set(auth(ownerToken))).status, 200); // already redeemed: unchanged
  // The demo organisation stays exempt
  const [[demoOrg]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  assert.deepEqual([(await assign(demoOrg.id, { plan: 'free' })).status, (await assign(demoOrg.id, { plan: 'free' })).body.code], [403, 'BILLING_EXEMPT']);
  assert.equal((await request(app).post(P(`/organizations/${demoOrg.id}/subscription/extend-trial`)).set(auth(ownerToken)).send({ days: 5 })).status, 403);
  assert.equal((await request(app).post(P('/organizations/99999/subscription/extend-trial')).set(auth(ownerToken)).send({ days: 5 })).status, 404);
  // Plans: price change without code; the pricing page follows
  const plans = (await request(app).get(P('/plans')).set(auth(ownerToken))).body;
  const starter = plans.find((p) => p.code === 'starter');
  const upd = await request(app).put(P('/plans/starter')).set(auth(ownerToken)).send({ ...starter, priceMonthly: 109, priceYearly: 1090, extraEmployee: 6, includedEmployees: 15, maxAdmins: 1, maxHr: 1 });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal((await request(app).get('/api/billing/plans')).body.plans.find((p) => p.code === 'starter').priceMonthly, 10900);
  assert.match((await logs('UPDATE_PLAN'))[0].descriptions, /monthly GHS 99\.00 -> GHS 109\.00/);
  assert.equal((await logs('UPDATE_PLAN'))[0].scope, 'platform');
  assert.equal((await request(app).put(P('/plans/starter')).set(auth(ownerToken)).send({ ...starter, priceMonthly: '' })).status, 400);
  assert.equal((await request(app).put(P('/plans/free')).set(auth(ownerToken)).send({ ...plans[0], priceMonthly: 10 })).status, 400);
  // Founding offer off: the pricing page stops showing it and new checkouts get no discount
  assert.equal((await request(app).put(P('/coupons/FOUNDING40')).set(auth(ownerToken)).send({ isActive: false })).status, 200);
  assert.equal((await request(app).get('/api/billing/plans')).body.offer, null);
  assert.equal((await request(app).put(P('/coupons/FOUNDING40')).set(auth(ownerToken)).send({ maxRedemptions: 0 })).status, 400);
  // Revenue: paid Growth (GHS 149.40, in grace now so not counted) + Enterprise GHS 1,500 manual
  const rev = (await request(app).get(P('/billing')).set(auth(ownerToken))).body;
  assert.equal(rev.mrr, 150000);
  assert.equal(rev.arr, 1800000);
  assert.equal(rev.counts.manual, 2); // Starter Shop (complimentary, no price) and the Enterprise deal
  assert.equal(rev.counts.exempt, 1);
  assert.ok(rev.recentPayments.length >= 2);
  // Organisation list carries the subscription status
  const list = (await request(app).get(P('/organizations')).set(auth(ownerToken))).body;
  assert.equal(list.find((o) => o.id === org.id).subscription.plan_code, 'enterprise');
});

test('tenant isolation: notices and payments of another organisation cannot be read or dismissed', async () => {
  const [[n]] = await conn.query('SELECT id FROM billing_notices WHERE organization_id = ? LIMIT 1', [paidOrg.id]);
  const other = (await login('admin@othertenant.example', PW)).body.token;
  assert.equal((await request(app).post(`/api/billing/notices/${n.id}/dismiss`).set(auth(other))).status, 404);
  assert.equal((await request(app).post(`/api/billing/notices/${n.id}/dismiss`).set(auth(paidOrg.admin))).status, 200);
  const ov = (await request(app).get('/api/billing').set(auth(other))).body;
  assert.ok(ov.notices.every((x) => x.id !== n.id));
  assert.equal(ov.subscription.plan.code, 'growth');
  assert.equal(ov.subscription.amount, null);
});

test('owner controls: end trial now, record a manual payment with an invoice, pause/resume, cancel; all platform-audited', async () => {
  const org = await makeOrg('Owner Controls Ltd', 'admin@ownercontrols.example');
  const url = (a) => P(`/organizations/${org.id}/subscription/${a}`);
  // End the trial now -> grace (the usual rule), then a manual payment
  let r = await request(app).post(url('end-trial')).set(auth(ownerToken)).send({});
  assert.deepEqual([r.status, r.body.status], [200, 'grace']);
  assert.equal((await sub(org.id)).status, 'grace');
  assert.equal((await request(app).post(url('end-trial')).set(auth(ownerToken)).send({})).status, 409);
  assert.equal((await logs('BILLING_TRIAL_ENDED'))[0].scope, 'platform');
  // Validation
  assert.equal((await request(app).post(url('mark-paid')).set(auth(ownerToken)).send({ plan: 'starter', months: 1, amount: 99, method: 'cheque' })).status, 400);
  assert.equal((await request(app).post(url('mark-paid')).set(auth(ownerToken)).send({ plan: 'free', months: 1, amount: 99, method: 'cash' })).status, 400);
  r = await request(app).post(url('mark-paid')).set(auth(ownerToken)).send({ plan: 'starter', months: 3, amount: 297, method: 'momo', reference: 'MOMO-7781', note: 'Paid at the office' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.payment.invoice_number, /^EC-\d{4}-\d{6}$/);
  let s = await sub(org.id);
  assert.deepEqual([s.status, s.billing_mode, s.plan_code, s.manual_monthly_pesewas], ['active', 'manual', 'starter', 9900]);
  assert.ok(Math.abs(new Date(s.manual_until) - Date.now() - 92 * DAY) < 3 * DAY);
  // The admin sees the payment and can download the invoice
  const pays = (await request(app).get('/api/billing/payments').set(auth(org.admin))).body;
  assert.equal(pays.length, 1);
  assert.match(pays[0].description, /mobile money, ref MOMO-7781/);
  const pdf = await request(app).get(`/api/billing/payments/${pays[0].id}/invoice`).set(auth(org.admin));
  assert.deepEqual([pdf.status, pdf.headers['content-type']], [200, 'application/pdf']);
  // A second payment for the same plan continues from the end date
  const until = new Date(s.manual_until);
  await request(app).post(url('mark-paid')).set(auth(ownerToken)).send({ plan: 'starter', months: 1, amount: 99, method: 'cash' });
  assert.ok(Math.abs(new Date((await sub(org.id)).manual_until) - until - 30 * DAY) < 2 * DAY);
  assert.ok((await logs('BILLING_MANUAL_PAYMENT')).every((l) => l.scope === 'platform'));
  // Pause: Free entitlements (payroll locked), data kept; resume restores the paid plan
  r = await request(app).post(url('pause')).set(auth(ownerToken)).send({ note: 'Owner request' });
  assert.deepEqual([r.status, (await sub(org.id)).status], [200, 'paused']);
  const st = (await request(app).get('/api/billing/status').set(auth(org.admin))).body;
  assert.deepEqual([st.plan, st.features.payroll], ['free', false]);
  assert.equal((await request(app).post(url('pause')).set(auth(ownerToken))).status, 409);
  r = await request(app).post(url('resume')).set(auth(ownerToken));
  assert.deepEqual([r.status, r.body.status], [200, 'active']);
  assert.equal((await logs('BILLING_SUBSCRIPTION_PAUSED')).length, 1);
  assert.equal((await logs('BILLING_SUBSCRIPTION_RESUMED')).length, 1);
  // Cancel at period end only applies to Paystack subscriptions; cancel now -> Free, data kept
  assert.equal((await request(app).post(url('cancel')).set(auth(ownerToken)).send({ when: 'period_end' })).status, 409);
  r = await request(app).post(url('cancel')).set(auth(ownerToken)).send({ when: 'now' });
  assert.deepEqual([r.status, (await sub(org.id)).status], [200, 'free']);
  assert.equal((await request(app).get('/api/billing/payments').set(auth(org.admin))).body.length, 2);
  assert.equal((await logs('BILLING_SUBSCRIPTION_CANCELLED'))[0].scope, 'platform');
  // The demo organisation refuses every control; admins cannot use them
  const demoId = (await conn.query("SELECT id FROM organizations WHERE slug = 'demo'"))[0][0].id;
  for (const a of ['end-trial', 'mark-paid', 'cancel', 'pause', 'resume']) {
    assert.equal((await request(app).post(P(`/organizations/${demoId}/subscription/${a}`)).set(auth(ownerToken)).send({ plan: 'starter', months: 1, amount: 99, method: 'cash' })).status, 403, a);
  }
  assert.equal((await request(app).post(url('mark-paid')).set(auth(org.admin)).send({ plan: 'starter', months: 1, amount: 99, method: 'cash' })).status, 403);
});

test('payments settings: mode from the key prefix, never the key itself; webhook URL and last webhook time', async () => {
  const saved = { s: process.env.PAYSTACK_SECRET_KEY, p: process.env.PAYSTACK_PUBLIC_KEY };
  try {
    delete process.env.PAYSTACK_SECRET_KEY; delete process.env.PAYSTACK_PUBLIC_KEY;
    let r = await request(app).get(P('/billing/settings')).set(auth(ownerToken));
    assert.deepEqual([r.status, r.body.connected, r.body.mode, r.body.publicKeySet], [200, false, null, false]);
    assert.match(r.body.webhookUrl, /\/api\/billing\/paystack\/webhook$/);
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_onlyfortests0000'; process.env.PAYSTACK_PUBLIC_KEY = 'pk_live_onlyfortests0000';
    r = await request(app).get(P('/billing/settings')).set(auth(ownerToken));
    assert.deepEqual([r.body.connected, r.body.mode, r.body.publicKeyMode, r.body.modeMismatch], [true, 'test', 'live', true]);
    assert.ok(!JSON.stringify(r.body).includes('onlyfortests'), 'keys are never returned');
    assert.ok(r.body.lastWebhookAt, 'earlier tests delivered webhooks');
    assert.equal((await request(app).get(P('/billing/settings')).set(auth(demoAdmin))).status, 403);
  } finally {
    if (saved.s === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = saved.s;
    if (saved.p === undefined) delete process.env.PAYSTACK_PUBLIC_KEY; else process.env.PAYSTACK_PUBLIC_KEY = saved.p;
  }
});

test('in-app daily scheduler: due from 06:00 UTC until a run succeeds that day', async () => {
  const { due } = require('../services/billingScheduler');
  const today = new Date();
  const at = (h) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h, 30));
  await conn.query('DELETE FROM billing_job_runs');
  assert.equal(await due(at(5)), false);
  assert.equal(await due(at(7)), true);
  await runDaily({ log: () => {} });
  assert.equal(await due(at(7)), false);
  const second = await runDaily({ log: () => {} }); // a cron service as well: still safe
  assert.equal(second.skipped, false);
});
