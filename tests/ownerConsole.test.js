// Organisation review (approve / reject / delete a registration), demo enquiries and the owner's own account.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { resetDatabase, rawConnection, DEMO, ORG_DETAILS } = require('./helpers');

const SETUP_TOKEN = 'test-setup-token-0123456789-abcdef';
process.env.OWNER_SETUP_TOKEN_HASH = bcrypt.hashSync(SETUP_TOKEN, 4);
const OWNER = { email: 'owner@platform.example', name: 'Platform Owner', password: 'Strong-Platform-Key-2026' };
const PW = 'Password123';

let request, app, db, conn, ownerToken, demoAdmin;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });
const signup = (body) => request(app).post('/api/organizations/register').send({ ...ORG_DETAILS, ...body });
const enquire = (body) => request(app).post('/api/enquiries').send(body);
const P = (path) => `/api/platform${path}`;
const logs = async (action) => (await conn.query('SELECT * FROM audit_logs WHERE actions = ? ORDER BY LogId', [action]))[0];
const orgBySlug = async (slug) => (await conn.query('SELECT * FROM organizations WHERE slug = ?', [slug]))[0][0];

before(async () => {
  await resetDatabase();
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
  conn = await rawConnection();
  demoAdmin = (await login(DEMO.admin.email, DEMO.admin.password)).body.token;
  assert.equal((await request(app).post(P('/bootstrap-owner')).send({ ...OWNER, setupToken: SETUP_TOKEN })).status, 201);
  ownerToken = (await login(OWNER.email, OWNER.password)).body.token;
});
after(async () => {
  if (conn) await conn.end();
  if (db) db.end();
});

// ---------- review: reject / approve / delete
test('owner rejects a registration with a reason; the admin sees it at sign-in; approve later still works', async () => {
  assert.equal((await signup({ organizationName: 'Ho Bakery', adminName: 'Kofi Ho', email: 'kofi@ho.example', password: PW, contactName: 'Ama Ho', contactEmail: 'ama@ho.example' })).status, 201);
  const org = await orgBySlug('ho-bakery');
  assert.deepEqual([org.contact_name, org.contact_email], ['Ama Ho', 'ama@ho.example']);
  // Pending shows prominently in the overview and the pending filter
  const ov = (await request(app).get(P('/overview')).set(auth(ownerToken))).body;
  assert.equal(ov.pending, 1);
  const pend = (await request(app).get(P('/organizations')).query({ status: 'pending' }).set(auth(ownerToken))).body;
  assert.deepEqual(pend.map((o) => o.slug), ['ho-bakery']);
  assert.equal(pend[0].org_type, 'Private company');
  // Only the owner can reject; reason length is checked
  assert.equal((await request(app).post(P(`/organizations/${org.id}/reject`)).set(auth(demoAdmin))).status, 403);
  assert.equal((await request(app).post(P(`/organizations/${org.id}/reject`)).set(auth(ownerToken)).send({ reason: 'x'.repeat(501) })).status, 400);
  const r = await request(app).post(P(`/organizations/${org.id}/reject`)).set(auth(ownerToken)).send({ reason: 'We could not verify the organisation.' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'rejected');
  const after1 = await orgBySlug('ho-bakery');
  assert.equal(after1.status, 'rejected');
  assert.equal(after1.rejection_reason, 'We could not verify the organisation.');
  assert.ok(after1.reviewed_at);
  // Rejecting twice -> 409; suspend is not the same thing
  assert.equal((await request(app).post(P(`/organizations/${org.id}/reject`)).set(auth(ownerToken))).status, 409);
  const l = await login('kofi@ho.example', PW);
  assert.equal(l.status, 403);
  assert.equal(l.body.code, 'ORGANISATION_REJECTED');
  assert.equal(l.body.reason, 'We could not verify the organisation.');
  assert.match(l.body.error, /not approved/);
  const [log] = await logs('REJECT_ORGANIZATION');
  assert.equal(log.organization_id, org.id);
  assert.match(log.descriptions, /could not verify/);
  assert.equal((await request(app).get(P('/overview')).set(auth(ownerToken))).body.rejected, 1);
  // Changing your mind: approve a rejected registration; the reason is cleared and the admin can sign in
  assert.equal((await request(app).post(P(`/organizations/${org.id}/approve`)).set(auth(ownerToken))).status, 200);
  const after2 = await orgBySlug('ho-bakery');
  assert.deepEqual([after2.status, after2.rejection_reason], ['active', null]);
  assert.equal((await login('kofi@ho.example', PW)).status, 200);
});

test('a rejected admin with an old token is signed out', async () => {
  await signup({ organizationName: 'Cape Coast Tours', adminName: 'Efua Tour', email: 'efua@cct.example', password: PW });
  const org = await orgBySlug('cape-coast-tours');
  await request(app).post(P(`/organizations/${org.id}/approve`)).set(auth(ownerToken));
  const t = (await login('efua@cct.example', PW)).body.token;
  assert.equal((await request(app).get('/api/users/me').set(auth(t))).status, 200);
  await conn.query("UPDATE organizations SET status = 'rejected' WHERE id = ?", [org.id]);
  const me = await request(app).get('/api/users/me').set(auth(t));
  assert.equal(me.status, 401);
  assert.equal(me.body.code, 'ORGANISATION_REJECTED');
});

test('a pending or rejected registration can be deleted with its sign-up account; an organisation in use cannot', async () => {
  await signup({ organizationName: 'Spam Org', adminName: 'Spam Bot', email: 'spam@spam.example', password: PW });
  const spam = await orgBySlug('spam-org');
  const del = await request(app).delete(P(`/organizations/${spam.id}`)).set(auth(ownerToken));
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(await orgBySlug('spam-org'), undefined);
  const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM users WHERE email = 'spam@spam.example'");
  assert.equal(n, 0);
  const [log] = await logs('DELETE_ORGANIZATION');
  assert.match(log.descriptions, /Spam Org.*pending.*1 sign-up account/);
  // Rejected and then deleted
  await signup({ organizationName: 'Nope Ltd', adminName: 'No Body', email: 'no@nope.example', password: PW });
  const nope = await orgBySlug('nope-ltd');
  await request(app).post(P(`/organizations/${nope.id}/reject`)).set(auth(ownerToken)).send({});
  assert.equal((await request(app).delete(P(`/organizations/${nope.id}`)).set(auth(ownerToken))).status, 200);
  // The active demo organisation, with users and employees, cannot be deleted
  const demo = await orgBySlug('demo');
  assert.equal((await request(app).delete(P(`/organizations/${demo.id}`)).set(auth(ownerToken))).status, 409);
  // Demo still works
  assert.equal((await login(DEMO.admin.email, DEMO.admin.password)).status, 200);
});

// ---------- enquiries
test('public demo request is validated, rate-limited and stored as a new enquiry', async () => {
  const good = { name: 'Abena Darko', organizationName: 'Darko Clinic', email: 'Abena@Darko.example', phone: '+233 24 111 2222', message: 'We would like a walkthrough for our 40 staff.' };
  for (const body of [
    { ...good, name: 'A' },
    { ...good, email: 'bad' },
    { ...good, phone: 'ring ring' },
    { ...good, message: 'short' },
    { ...good, message: 'x'.repeat(3001) },
    { ...good, organizationName: 'x'.repeat(151) },
  ]) assert.equal((await enquire(body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.equal((await enquire({ ...good, website: 'http://spam.example' })).status, 400);
  const [[{ none }]] = await conn.query('SELECT COUNT(*) none FROM enquiries');
  assert.equal(none, 0);
  const r = await enquire(good);
  assert.equal(r.status, 201);
  assert.match(r.body.message, /received/);
  const [[row]] = await conn.query('SELECT name, organization_name, email, phone, message, status FROM enquiries');
  assert.deepEqual({ ...row }, { name: 'Abena Darko', organization_name: 'Darko Clinic', email: 'abena@darko.example', phone: '+233 24 111 2222', message: good.message, status: 'new' });
  // Phone and organisation are optional
  assert.equal((await enquire({ name: 'Kwesi', email: 'kwesi@example.com', message: 'Please call me back about pricing.' })).status, 201);
  const [log] = await logs('CREATE_ENQUIRY');
  assert.equal(log.organization_id, null);
  // Limiter is wired with its own budget
  const { rateLimit } = require('express-rate-limit');
  const express = require('express');
  const EnquiryController = require('../controllers/enquiryController');
  const limited = express().use(express.json()).post('/e', rateLimit({ windowMs: 60000, limit: 1, message: { error: 'Too many' } }), EnquiryController.create);
  assert.equal((await request(limited).post('/e').send({})).status, 400);
  assert.equal((await request(limited).post('/e').send({})).status, 429);
  assert.equal(typeof require('../config/rateLimits').enquiryLimiter, 'function');
});

test('owner lists, filters, updates and deletes enquiries; nobody else can', async () => {
  const ov = (await request(app).get(P('/overview')).set(auth(ownerToken))).body;
  assert.equal(ov.enquiries_new, 2);
  for (const t of [demoAdmin, null]) {
    const res = await request(app).get(P('/enquiries')).set(t ? auth(t) : {});
    assert.equal(res.status, t ? 403 : 401);
  }
  const list = (await request(app).get(P('/enquiries')).set(auth(ownerToken))).body;
  assert.equal(list.length, 2);
  const abena = list.find((e) => e.email === 'abena@darko.example');
  assert.equal((await request(app).put(P(`/enquiries/${abena.id}/status`)).set(auth(ownerToken)).send({ status: 'bogus' })).status, 400);
  assert.equal((await request(app).put(P('/enquiries/99999/status')).set(auth(ownerToken)).send({ status: 'contacted' })).status, 404);
  assert.equal((await request(app).put(P(`/enquiries/${abena.id}/status`)).set(auth(demoAdmin)).send({ status: 'contacted' })).status, 403);
  const u = await request(app).put(P(`/enquiries/${abena.id}/status`)).set(auth(ownerToken)).send({ status: 'contacted' });
  assert.equal(u.status, 200);
  const [[row]] = await conn.query('SELECT status, contacted_at FROM enquiries WHERE id = ?', [abena.id]);
  assert.equal(row.status, 'contacted');
  assert.ok(row.contacted_at);
  const onlyNew = (await request(app).get(P('/enquiries')).query({ status: 'new' }).set(auth(ownerToken))).body;
  assert.deepEqual(onlyNew.map((e) => e.email), ['kwesi@example.com']);
  const search = (await request(app).get(P('/enquiries')).query({ q: 'Darko' }).set(auth(ownerToken))).body;
  assert.deepEqual(search.map((e) => e.email), ['abena@darko.example']);
  assert.equal((await logs('UPDATE_ENQUIRY')).length, 1);
  assert.equal((await request(app).delete(P(`/enquiries/${abena.id}`)).set(auth(ownerToken))).status, 200);
  assert.equal((await request(app).delete(P(`/enquiries/${abena.id}`)).set(auth(ownerToken))).status, 404);
  assert.equal((await logs('DELETE_ENQUIRY')).length, 1);
});

// ---------- the owner's own account
test('owner edits their name freely; changing the e-mail needs the current password and a unique address', async () => {
  const get = await request(app).get(P('/account')).set(auth(ownerToken));
  assert.equal(get.status, 200);
  assert.deepEqual([get.body.username, get.body.email, get.body.role], [OWNER.name, OWNER.email, 'owner']);
  assert.ok(!('password' in get.body));
  assert.equal((await request(app).get(P('/account')).set(auth(demoAdmin))).status, 403);
  const put = (body, t = ownerToken) => request(app).put(P('/account')).set(auth(t)).send(body);
  assert.equal((await put({ name: 'J', email: OWNER.email })).status, 400);
  assert.equal((await put({ name: 'Joseph M', email: 'not-an-email' })).status, 400);
  const renamed = await put({ name: '  Joseph   M ', email: OWNER.email });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.user.username, 'Joseph M');
  assert.equal(renamed.body.token, undefined); // same session
  assert.equal((await request(app).get('/api/users/me').set(auth(ownerToken))).status, 200);
  // E-mail change: password required and checked; address must be free across all accounts
  assert.equal((await put({ name: 'Joseph M', email: 'new.owner@platform.example' })).status, 400);
  assert.equal((await put({ name: 'Joseph M', email: 'new.owner@platform.example', currentPassword: 'Wrong-Password-99' })).status, 400);
  assert.equal((await put({ name: 'Joseph M', email: DEMO.hr.email, currentPassword: OWNER.password })).status, 409);
  const moved = await put({ name: 'Joseph M', email: 'New.Owner@Platform.example', currentPassword: OWNER.password });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.user.email, 'new.owner@platform.example');
  assert.ok(moved.body.token);
  // Old sessions are signed out; the fresh token works; sign-in uses the new address
  assert.equal((await request(app).get('/api/users/me').set(auth(ownerToken))).status, 401);
  assert.equal((await request(app).get(P('/overview')).set(auth(moved.body.token))).status, 200);
  assert.equal((await login(OWNER.email, OWNER.password)).status, 401);
  const l = await login('new.owner@platform.example', OWNER.password);
  assert.equal(l.status, 200);
  ownerToken = l.body.token;
  const audit = await logs('UPDATE_OWNER_ACCOUNT');
  assert.equal(audit.length, 2);
  assert.ok(audit.every((a) => a.organization_id === null));
  assert.match(audit[1].descriptions, /owner@platform\.example -> new\.owner@platform\.example/);
  OWNER.email = 'new.owner@platform.example';
});

test('owner changes their password with the current one, under the owner password rules', async () => {
  const change = (body) => request(app).put('/api/users/change-password').set(auth(ownerToken)).send(body);
  // Org users' 8-character rule is not enough for the owner
  assert.equal((await change({ currentPassword: OWNER.password, newPassword: 'Password123' })).status, 400);
  assert.equal((await change({ currentPassword: 'Wrong-Password-99', newPassword: 'Another-Strong-Key-2027' })).status, 400);
  const ok = await change({ currentPassword: OWNER.password, newPassword: 'Another-Strong-Key-2027' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'owner');
  ownerToken = ok.body.token; // other sessions are signed out; this one gets a fresh token
  assert.equal((await login(OWNER.email, OWNER.password)).status, 401);
  assert.equal((await login(OWNER.email, 'Another-Strong-Key-2027')).status, 200);
  const [log] = (await logs('CHANGE_PASSWORD')).slice(-1);
  assert.equal(log.organization_id, null);
});

test('owner edits an organisation\'s sign-up details; fields left out are kept', async () => {
  const org = await orgBySlug('ho-bakery');
  const put = (body) => request(app).put(P(`/organizations/${org.id}`)).set(auth(ownerToken)).send(body);
  assert.equal((await put({ name: 'Ho Bakery', org_type: 'Spaceship' })).status, 400);
  assert.equal((await put({ name: 'Ho Bakery', phone: 'nope' })).status, 400);
  assert.equal((await put({ name: 'Ho Bakery', size_range: '51-200', city: 'Ho' })).status, 200);
  const row = await orgBySlug('ho-bakery');
  assert.deepEqual([row.size_range, row.city, row.country, row.org_type, row.contact_name], ['51-200', 'Ho', 'Ghana', 'Private company', 'Ama Ho']);
  await new Promise((r) => setTimeout(r, 100)); // audit entries are written after the response
  assert.match((await logs('UPDATE_ORGANIZATION')).slice(-1)[0].descriptions, /organisation details/);
});
