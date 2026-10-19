// Organisation sign-up, the one-time owner bootstrap and the platform owner console.
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
const P = (path) => `/api/platform${path}`;
// Audit entries are written just after the response is sent: wait briefly for them
const actions = async (action) => {
  let rows = [];
  for (let i = 0; i < 20; i += 1) {
    [rows] = await conn.query('SELECT * FROM audit_logs WHERE actions = ? ORDER BY LogId', [action]);
    if (rows.length) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  return rows;
};

before(async () => {
  await resetDatabase();
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
  conn = await rawConnection();
  demoAdmin = (await login(DEMO.admin.email, DEMO.admin.password)).body.token;
});
after(async () => {
  if (conn) await conn.end();
  if (db) db.end();
});

// ---------- organisation sign-up
test('organisation sign-up validates input', async () => {
  const good = { organizationName: 'Tema Shipping', adminName: 'Esi Owusu', email: 'esi@tema.example', password: PW };
  const bad = [
    { ...good, organizationName: 'T' },
    { ...good, adminName: '' },
    { ...good, email: 'not-an-email' },
    { ...good, password: 'short1' },
    { ...good, password: 'nodigitshere' },
    { ...good, organizationType: 'Spaceship' },
    { ...good, sizeRange: 'lots' },
    { ...good, country: '' },
    { ...good, phone: 'call me' },
    { ...good, contactEmail: 'nope' },
  ];
  for (const body of bad) assert.equal((await signup(body)).status, 400, JSON.stringify(body));
  // Honeypot filled in -> refused, nothing created
  assert.equal((await signup({ ...good, website: 'http://spam.example' })).status, 400);
  // E-mail already used by any account -> 409
  assert.equal((await signup({ ...good, email: DEMO.hr.email })).status, 409);
  const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM organizations WHERE name = 'Tema Shipping'");
  assert.equal(n, 0);
});

test('organisation sign-up creates a pending organisation and its admin, who cannot sign in yet', async () => {
  const r = await signup({ organizationName: '  Tema   Shipping ', adminName: 'Esi Owusu', email: 'Esi@Tema.example', password: PW });
  assert.equal(r.status, 201);
  assert.match(r.body.message, /waiting for approval/);
  assert.deepEqual(r.body.organization, { name: 'Tema Shipping', slug: 'tema-shipping', status: 'pending' });
  const [[row]] = await conn.query("SELECT o.status, o.contact_email, o.plan, o.seat_limit, o.approved_at, u.role, u.email FROM organizations o JOIN users u ON u.organization_id = o.id WHERE o.slug = 'tema-shipping'");
  assert.deepEqual({ ...row }, { status: 'pending', contact_email: 'esi@tema.example', plan: 'standard', seat_limit: null, approved_at: null, role: 'admin', email: 'esi@tema.example' });
  const l = await login('esi@tema.example', PW);
  assert.equal(l.status, 403);
  assert.equal(l.body.code, 'ORGANISATION_PENDING');
  assert.equal((await actions('REGISTER_ORGANIZATION')).length, 1);
  // The sign-up details are stored; the contact person defaults to the admin
  const [[details]] = await conn.query("SELECT org_type, size_range, country, city, phone, contact_name FROM organizations WHERE slug = 'tema-shipping'");
  assert.deepEqual({ ...details }, { org_type: 'Private company', size_range: '11-50', country: 'Ghana', city: 'Accra', phone: '+233 20 000 0000', contact_name: 'Esi Owusu' });
  // Same name again gets its own slug
  const again = await signup({ organizationName: 'Tema Shipping', adminName: 'Kojo Owusu', email: 'kojo@tema.example', password: PW });
  assert.equal(again.body.organization.slug, 'tema-shipping-2');
});

test('organisation sign-up is rate-limited per IP', async () => {
  const { rateLimit } = require('express-rate-limit');
  const express = require('express');
  const OrganizationController = require('../controllers/organizationController');
  const limited = express().use(express.json()).post('/r', rateLimit({ windowMs: 60000, limit: 2, message: { error: 'Too many' } }), OrganizationController.register);
  const body = { organizationName: 'X', adminName: 'Y', email: 'bad', password: 'x' };
  assert.equal((await request(limited).post('/r').send(body)).status, 400);
  assert.equal((await request(limited).post('/r').send(body)).status, 400);
  assert.equal((await request(limited).post('/r').send(body)).status, 429);
  // The real limiter is wired to the route with its own (configurable) budget
  const { orgSignupLimiter } = require('../config/rateLimits');
  assert.equal(typeof orgSignupLimiter, 'function');
});

// ---------- owner bootstrap
test('owner bootstrap: wrong token 403, weak password 400, org e-mail 409, then 201 and 410 forever', async () => {
  const b = (body) => request(app).post(P('/bootstrap-owner')).send(body);
  assert.equal((await b({ ...OWNER })).status, 403);
  assert.equal((await b({ ...OWNER, setupToken: 'wrong-token-wrong-token-1234' })).status, 403);
  assert.equal((await b({ ...OWNER, setupToken: SETUP_TOKEN, password: 'Short-1' })).status, 400);
  assert.equal((await b({ ...OWNER, setupToken: SETUP_TOKEN, password: 'owner-owner-owner-1' , email: 'owner@platform.example' })).status, 400); // contains e-mail name
  assert.equal((await b({ ...OWNER, setupToken: SETUP_TOKEN, email: DEMO.admin.email })).status, 409);
  assert.equal((await b({ ...OWNER, setupToken: SETUP_TOKEN, email: 'nope' })).status, 400);
  const ok = await b({ ...OWNER, setupToken: SETUP_TOKEN });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.ok(!JSON.stringify(ok.body).includes(OWNER.password));
  const gone = await b({ ...OWNER, setupToken: SETUP_TOKEN, email: 'second@platform.example' });
  assert.equal(gone.status, 410);
  assert.equal((await b({})).status, 410);
  const [[row]] = await conn.query('SELECT role, organization_id, password FROM users WHERE email = ?', [OWNER.email]);
  assert.equal(row.role, 'owner');
  assert.equal(row.organization_id, null);
  assert.match(row.password, /^\$2[aby]\$12\$/);
  const [log] = await actions('BOOTSTRAP_OWNER');
  assert.equal(log.organization_id, null);
});

test('the committed bootstrap hash is a bcrypt hash and env overrides it', () => {
  const cfg = require('../config/ownerBootstrap');
  assert.match(cfg.DEFAULT_OWNER_SETUP_TOKEN_HASH, /^\$2[aby]\$12\$.{53}$/);
  assert.equal(cfg.ownerSetupTokenHash(), process.env.OWNER_SETUP_TOKEN_HASH);
});

test('owner signs in to the console; owner and org areas are separate', async () => {
  const r = await login(OWNER.email, OWNER.password);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'owner');
  assert.equal(r.body.user.organization, null);
  ownerToken = r.body.token;
  // Owner is not an org user
  for (const url of ['/api/employees', '/api/users/all', '/api/departments', '/api/audit-logs', '/api/users/linkable']) {
    assert.equal((await request(app).get(url).set(auth(ownerToken))).status, 403, url);
  }
  assert.equal((await request(app).post('/api/users/register').set(auth(ownerToken)).send({ username: 'X Y', email: 'xy@example.com', password: PW })).status, 403);
  assert.equal((await request(app).get('/api/users/me').set(auth(ownerToken))).status, 200);
  // Org users (even admins) and anonymous callers cannot use the console
  for (const url of ['/overview', '/organizations', '/admins', '/audit-logs']) {
    assert.equal((await request(app).get(P(url)).set(auth(demoAdmin))).status, 403, url);
    assert.equal((await request(app).get(P(url))).status, 401, url);
  }
});

test('overview counts come from the database', async () => {
  const r = await request(app).get(P('/overview')).set(auth(ownerToken));
  assert.equal(r.status, 200);
  const [[c]] = await conn.query(`SELECT (SELECT COUNT(*) FROM organizations WHERE status='pending') pending,
    (SELECT COUNT(*) FROM organizations WHERE status='active') active, (SELECT COUNT(*) FROM users WHERE role <> 'owner') users,
    (SELECT COUNT(*) FROM employees) employees`);
  assert.equal(r.body.pending, c.pending);
  assert.equal(r.body.pending, 2);
  assert.equal(r.body.active, c.active);
  assert.equal(r.body.suspended, 0);
  assert.equal(r.body.users, c.users);
  assert.equal(r.body.employees, c.employees);
  assert.equal(r.body.signups_30d, 3);
});

test('organisations: list, search, filter by status, detail with admins and role counts', async () => {
  let r = await request(app).get(P('/organizations')).set(auth(ownerToken));
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 3);
  assert.equal(r.body[0].status, 'pending'); // pending first: they need action
  r = await request(app).get(P('/organizations?status=active')).set(auth(ownerToken));
  assert.deepEqual(r.body.map((o) => o.slug), ['demo']);
  assert.equal(r.body[0].employee_count, 8);
  assert.equal(r.body[0].user_count, 3);
  r = await request(app).get(P('/organizations?q=tema')).set(auth(ownerToken));
  assert.equal(r.body.length, 2);
  r = await request(app).get(P('/organizations?q=%25')).set(auth(ownerToken)); // LIKE wildcard is escaped
  assert.equal(r.body.length, 0);
  const [[tema]] = await conn.query("SELECT id FROM organizations WHERE slug = 'tema-shipping'");
  r = await request(app).get(P(`/organizations/${tema.id}`)).set(auth(ownerToken));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.admins.map((u) => u.email), ['esi@tema.example']);
  assert.equal(r.body.admins[0].password, undefined);
  assert.ok('last_login_at' in r.body.admins[0]);
  assert.equal(r.body.users, undefined);
  // Tenant boundary: counts for HR and employee accounts, never their names or e-mails
  const [[demo]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  r = await request(app).get(P(`/organizations/${demo.id}`)).set(auth(ownerToken));
  assert.deepEqual(r.body.admins.map((u) => u.email), [DEMO.admin.email]);
  assert.deepEqual(r.body.user_counts, { admin: { active: 1, inactive: 0 }, hr: { active: 1, inactive: 0 }, employee: { active: 1, inactive: 0 } });
  const text = JSON.stringify(r.body);
  for (const leak of [DEMO.hr.email, DEMO.employee.email, 'Kofi Asante']) assert.ok(!text.includes(leak), `owner sees ${leak}`);
  assert.equal((await request(app).get(P('/organizations/99999')).set(auth(ownerToken))).status, 404);
});

test('approve, suspend and reactivate change who can sign in; every action is audit-logged', async () => {
  const [[tema]] = await conn.query("SELECT id FROM organizations WHERE slug = 'tema-shipping'");
  const act = (a) => request(app).post(P(`/organizations/${tema.id}/${a}`)).set(auth(ownerToken));
  assert.equal((await act('reactivate')).status, 409); // pending, not suspended
  let r = await act('approve');
  assert.equal(r.status, 200);
  const [[o]] = await conn.query('SELECT status, approved_at FROM organizations WHERE id = ?', [tema.id]);
  assert.equal(o.status, 'active');
  assert.ok(o.approved_at);
  assert.equal((await act('approve')).status, 409);
  const l = await login('esi@tema.example', PW);
  assert.equal(l.status, 200);
  assert.equal(l.body.user.organization.slug, 'tema-shipping');
  assert.equal((await act('suspend')).status, 200);
  assert.equal((await login('esi@tema.example', PW)).body.code, 'ORGANISATION_SUSPENDED');
  assert.equal((await request(app).get('/api/users/all').set(auth(l.body.token))).status, 401);
  assert.equal((await act('reactivate')).status, 200);
  assert.equal((await request(app).get('/api/users/all').set(auth(l.body.token))).status, 200);
  for (const a of ['APPROVE_ORGANIZATION', 'SUSPEND_ORGANIZATION', 'REACTIVATE_ORGANIZATION']) {
    const [entry] = await actions(a);
    assert.ok(entry, a);
    assert.equal(entry.organization_id, tema.id);
  }
  // Admin of the approved organisation sees these entries in their own audit log too
  const own = await request(app).get('/api/audit-logs').set(auth(l.body.token));
  assert.ok(own.body.some((e) => e.actions === 'APPROVE_ORGANIZATION'));
});

test('the public demo organisation cannot be suspended in demo mode', async () => {
  const [[demo]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  const r = await request(app).post(P(`/organizations/${demo.id}/suspend`)).set(auth(ownerToken));
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'DEMO_ORGANISATION_PROTECTED');
  assert.equal((await login(DEMO.hr.email, DEMO.hr.password)).status, 200);
});

test('owner creates an organisation with its first admin (temporary password shown once)', async () => {
  const body = { name: 'Cape Coast Clinic', plan: 'pilot', seat_limit: 5, admin: { name: 'Abena Clinic', email: 'abena@clinic.example' } };
  assert.equal((await request(app).post(P('/organizations')).set(auth(ownerToken)).send({ ...body, seat_limit: 0 })).status, 400);
  assert.equal((await request(app).post(P('/organizations')).set(auth(ownerToken)).send({ ...body, admin: { name: 'A B', email: DEMO.hr.email } })).status, 409);
  const r = await request(app).post(P('/organizations')).set(auth(ownerToken)).send(body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.temporaryPassword);
  const l = await login('abena@clinic.example', r.body.temporaryPassword);
  assert.equal(l.status, 200);
  assert.equal(l.body.user.mustChangePassword, true);
  const [[org]] = await conn.query('SELECT status, plan, seat_limit, contact_email FROM organizations WHERE id = ?', [r.body.id]);
  // The plan comes from the subscription (migration 009): a new organisation starts a 30-day Growth trial now
  assert.deepEqual({ ...org }, { status: 'active', plan: 'growth', seat_limit: 5, contact_email: 'abena@clinic.example' });
  const [[sub]] = await conn.query('SELECT plan_code, status, trial_ends_at FROM organization_subscriptions WHERE organization_id = ?', [r.body.id]);
  assert.deepEqual([sub.plan_code, sub.status], ['growth', 'trialing']);
  assert.ok(Math.abs(new Date(sub.trial_ends_at) - Date.now() - 30 * 86400000) < 120000);
  assert.equal((await actions('CREATE_ORGANIZATION'))[0].organization_id, r.body.id);
});

test('owner edits name, seat limit and contact e-mail (the plan belongs to the subscription)', async () => {
  const [[org]] = await conn.query("SELECT id FROM organizations WHERE name = 'Cape Coast Clinic'");
  const put = (body) => request(app).put(P(`/organizations/${org.id}`)).set(auth(ownerToken)).send(body);
  assert.equal((await put({ name: 'C' })).status, 400);
  assert.equal((await put({ name: 'Clinic', seat_limit: -1 })).status, 400);
  assert.equal((await put({ name: 'Clinic', contact_email: 'bad' })).status, 400);
  assert.equal((await put({ name: 'Clinic', plan: '<script>' })).status, 400);
  const r = await put({ name: 'Cape Coast Clinic Ltd', plan: 'standard', seat_limit: '', contact_email: 'office@clinic.example' });
  assert.equal(r.status, 200);
  const [[row]] = await conn.query('SELECT name, plan, seat_limit, contact_email FROM organizations WHERE id = ?', [org.id]);
  assert.deepEqual({ ...row }, { name: 'Cape Coast Clinic Ltd', plan: 'growth', seat_limit: null, contact_email: 'office@clinic.example' });
  assert.doesNotMatch((await actions('UPDATE_ORGANIZATION'))[0].descriptions, /plan/);
  assert.equal((await request(app).put(P('/organizations/99999')).set(auth(ownerToken)).send({ name: 'Nope' })).status, 404);
});

test('an organisation can only be deleted when it has no users or employees', async () => {
  const [[tema]] = await conn.query("SELECT id FROM organizations WHERE slug = 'tema-shipping'");
  assert.equal((await request(app).delete(P(`/organizations/${tema.id}`)).set(auth(ownerToken))).status, 409);
  await conn.query("INSERT INTO organizations (name, slug, status) VALUES ('Empty Org', 'empty-org', 'pending')");
  const [[empty]] = await conn.query("SELECT id FROM organizations WHERE slug = 'empty-org'");
  await conn.query("INSERT INTO departments (organization_id, name) VALUES (?, 'Unused')", [empty.id]);
  assert.equal((await request(app).delete(P(`/organizations/${empty.id}`)).set(auth(ownerToken))).status, 200);
  const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM departments WHERE organization_id = ?', [empty.id]);
  assert.equal(n, 0);
  assert.equal((await request(app).delete(P(`/organizations/${empty.id}`)).set(auth(ownerToken))).status, 404);
  assert.match((await actions('DELETE_ORGANIZATION'))[0].descriptions, /Empty Org/);
});

test('organisation admins: search and filter across organisations; HR, employees and owners are never listed', async () => {
  let r = await request(app).get(P('/admins')).set(auth(ownerToken));
  assert.equal(r.status, 200);
  assert.ok(r.body.length >= 2 && r.body.every((u) => u.role === 'admin'));
  assert.ok(!r.body.some((u) => u.email === OWNER.email));
  assert.ok(r.body.some((u) => u.organization_name === 'EmploCore Demo') && r.body.some((u) => u.organization_name === 'Tema Shipping'));
  assert.ok(r.body.every((u) => 'last_login_at' in u && u.password === undefined));
  const [[tema]] = await conn.query("SELECT id FROM organizations WHERE slug = 'tema-shipping'");
  await conn.query("INSERT INTO users (organization_id, username, email, password, role) VALUES (?, 'Tema Staff', 'staff@tema.example', 'x', 'hr')", [tema.id]);
  r = await request(app).get(P('/admins?q=tema.example')).set(auth(ownerToken));
  assert.deepEqual(r.body.map((u) => u.email).sort(), ['esi@tema.example', 'kojo@tema.example']); // never staff@tema.example (HR)
  r = await request(app).get(P(`/admins?organization_id=${tema.id}`)).set(auth(ownerToken));
  assert.deepEqual(r.body.map((u) => u.email), ['esi@tema.example']);
  const [[demo]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  r = await request(app).get(P(`/admins?organization_id=${demo.id}`)).set(auth(ownerToken));
  assert.deepEqual(r.body.map((u) => u.email), [DEMO.admin.email]);
  r = await request(app).get(P('/admins?status=inactive')).set(auth(ownerToken));
  assert.deepEqual(r.body, []);
  // The old cross-organisation user list is gone
  assert.equal((await request(app).get(P('/users')).set(auth(ownerToken))).status, 404);
});

test('owner support actions reach organisation admins only; demo protection applies; owners are out of reach', async () => {
  const [[esi]] = await conn.query("SELECT id, organization_id FROM users WHERE email = 'esi@tema.example'");
  const [[owner]] = await conn.query("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1");
  let r = await request(app).put(P(`/admins/${esi.id}/status`)).set(auth(ownerToken)).send({ is_active: false });
  assert.equal(r.status, 200);
  assert.equal((await login('esi@tema.example', PW)).body.code, 'ACCOUNT_DEACTIVATED');
  assert.equal((await request(app).put(P(`/admins/${esi.id}/status`)).set(auth(ownerToken)).send({ is_active: true })).status, 200);
  const [deact] = await actions('DEACTIVATE_USER');
  assert.equal(deact.organization_id, esi.organization_id); // filed under the admin's organisation
  assert.equal(deact.UserId, owner.id); // ...with the owner as the actor
  r = await request(app).post(P(`/admins/${esi.id}/temporary-password`)).set(auth(ownerToken));
  assert.equal(r.status, 200);
  assert.equal((await login('esi@tema.example', r.body.temporaryPassword)).body.user.mustChangePassword, true);
  r = await request(app).post(P(`/admins/${esi.id}/reset-link`)).set(auth(ownerToken));
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  const [[{ scopes }]] = await conn.query(
    "SELECT GROUP_CONCAT(DISTINCT scope) scopes FROM audit_logs WHERE UserId = ? AND actions IN ('DEACTIVATE_USER','ACTIVATE_USER','ADMIN_PASSWORD','RESET_LINK_CREATED')", [owner.id]);
  assert.equal(scopes, 'platform');
  // HR and employee accounts are the organisation's business: 404, as if they did not exist
  const [[kojo]] = await conn.query("SELECT id FROM users WHERE email = 'staff@tema.example'"); // HR at Tema
  const [[demoHr]] = await conn.query('SELECT id FROM users WHERE email = ?', [DEMO.hr.email]);
  for (const id of [kojo.id, demoHr.id]) {
    for (const [m, url, body] of [['put', `/admins/${id}/status`, { is_active: false }], ['post', `/admins/${id}/temporary-password`], ['post', `/admins/${id}/reset-link`]]) {
      assert.equal((await request(app)[m](P(url)).set(auth(ownerToken)).send(body)).status, 404, url);
    }
  }
  const [[{ active }]] = await conn.query('SELECT is_active active FROM users WHERE id = ?', [kojo.id]);
  assert.equal(active, 1);
  // The old per-user routes are gone
  assert.equal((await request(app).put(P(`/users/${kojo.id}/status`)).set(auth(ownerToken)).send({ is_active: false })).status, 404);
  // Demo accounts stay protected from the owner too
  const [[demoAdminRow]] = await conn.query('SELECT id FROM users WHERE email = ?', [DEMO.admin.email]);
  for (const [m, url, body] of [['put', `/admins/${demoAdminRow.id}/status`, { is_active: false }], ['post', `/admins/${demoAdminRow.id}/temporary-password`], ['post', `/admins/${demoAdminRow.id}/reset-link`]]) {
    const res = await request(app)[m](P(url)).set(auth(ownerToken)).send(body);
    assert.equal(res.status, 403, url);
    assert.equal(res.body.code, 'DEMO_ACCOUNT_PROTECTED');
  }
  // Owner accounts are not org admins: 404
  assert.equal((await request(app).put(P(`/admins/${owner.id}/status`)).set(auth(ownerToken)).send({ is_active: false })).status, 404);
  await conn.query("INSERT INTO users (organization_id, username, email, password, role) VALUES (NULL, 'Second Owner', 'o2@platform.example', 'x', 'owner')");
  const [[o2]] = await conn.query("SELECT id FROM users WHERE email = 'o2@platform.example'");
  assert.equal((await request(app).put(P(`/admins/${o2.id}/status`)).set(auth(ownerToken)).send({ is_active: false })).status, 404);
  assert.equal((await request(app).post(P(`/admins/${o2.id}/temporary-password`)).set(auth(ownerToken))).status, 404);
  // ...and org admins cannot reach owners either
  assert.equal((await request(app).put(`/api/users/${o2.id}/role`).set(auth(demoAdmin)).send({ role: 'admin' })).status, 404);
  assert.equal((await request(app).delete(`/api/users/${o2.id}`).set(auth(demoAdmin))).status, 404);
});

test('platform audit log: platform-scope entries only, never routine activity inside organisations', async () => {
  let r = await request(app).get(P('/audit-logs')).set(auth(ownerToken));
  assert.equal(r.status, 200);
  assert.ok(r.body.length > 0);
  const tenantActions = ['LOGIN', 'CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'VIEW_EMPLOYEES', 'CREATE_DEPARTMENT', 'REGISTER_USER', 'RUN_PAYROLL'];
  const [owners] = await conn.query("SELECT id FROM users WHERE role = 'owner'");
  const ownerIds = new Set(owners.map((o) => o.id));
  for (const l of r.body) {
    assert.ok(!tenantActions.includes(l.actions) || ownerIds.has(l.UserId), `owner sees tenant entry ${l.actions}`);
  }
  assert.ok(!JSON.stringify(r.body).includes('Demo data loaded'));
  const orgs = new Set(r.body.map((l) => l.organization_name));
  assert.ok(orgs.has('Tema Shipping')); // its registration and approval are organisation-level events
  // Routine activity of an organisation exists, but only its admin can read it
  const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM audit_logs WHERE scope = 'tenant' AND actions = 'LOGIN'");
  assert.ok(n > 0);
  const [[tema]] = await conn.query("SELECT id FROM organizations WHERE slug = 'tema-shipping'");
  r = await request(app).get(P(`/audit-logs?organization_id=${tema.id}`)).set(auth(ownerToken));
  assert.ok(r.body.length && r.body.every((l) => l.organization_id === tema.id));
  assert.ok(r.body.some((l) => l.actions === 'REGISTER_ORGANIZATION'));
  assert.ok(!r.body.some((l) => l.actions === 'LOGIN' && !ownerIds.has(l.UserId)));
  r = await request(app).get(P('/audit-logs?organization_id=platform')).set(auth(ownerToken));
  assert.ok(r.body.some((l) => l.actions === 'BOOTSTRAP_OWNER') && r.body.every((l) => l.organization_id === null));
  r = await request(app).get(P('/audit-logs?action=APPROVE_ORGANIZATION')).set(auth(ownerToken));
  assert.ok(r.body.length >= 1 && r.body.every((l) => l.actions === 'APPROVE_ORGANIZATION'));
  r = await request(app).get(P('/audit-logs?action=LOGIN')).set(auth(ownerToken));
  assert.ok(r.body.every((l) => ownerIds.has(l.UserId)));
});

test('organisation admins read their own organisation\'s whole log; HR and employees have no audit-log access', async () => {
  // The previous test gave Esi a temporary password; put a known one back
  await conn.query('UPDATE users SET password = ?, must_change_password = 0 WHERE email = ?', [await bcrypt.hash(PW, 4), 'esi@tema.example']);
  const l = await login('esi@tema.example', PW);
  assert.equal(l.status, 200);
  const [[tema]] = await conn.query("SELECT id FROM organizations WHERE slug = 'tema-shipping'");
  const own = await request(app).get('/api/audit-logs').set(auth(l.body.token));
  assert.equal(own.status, 200);
  assert.ok(own.body.every((e) => e.organization_id === tema.id));
  const kinds = new Set(own.body.map((e) => e.scope));
  assert.ok(kinds.has('tenant') && kinds.has('platform')); // their sign-ins and the owner's actions on their organisation
  const recent = await request(app).get('/api/audit-logs/recent').set(auth(l.body.token));
  assert.equal(recent.status, 200);
  for (const who of [DEMO.hr, DEMO.employee]) {
    const t = (await login(who.email, who.password)).body.token;
    assert.equal((await request(app).get('/api/audit-logs').set(auth(t))).status, 403);
    assert.equal((await request(app).get('/api/audit-logs/recent').set(auth(t))).status, 403);
  }
  // A successful sign-in records last_login_at
  const [[esi]] = await conn.query("SELECT last_login_at FROM users WHERE email = 'esi@tema.example'");
  assert.ok(esi.last_login_at);
});
