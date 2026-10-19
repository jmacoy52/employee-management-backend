const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, rawConnection, DEMO } = require('./helpers');

let request, app, db;
const tokens = {};
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });

before(async () => {
  await resetDatabase();
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
  for (const role of ['admin', 'hr', 'employee']) {
    const r = await login(DEMO[role].email, DEMO[role].password);
    assert.equal(r.status, 200, `login ${role}`);
    tokens[role] = r.body.token;
  }
});
after(() => db && db.end());

// ---------- basics
test('health and live endpoints', async () => {
  assert.equal((await request(app).get('/api/live')).status, 200);
  const h = await request(app).get('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.database, 'connected');
});

test('helmet security headers are set', async () => {
  const r = await request(app).get('/api/live');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.ok(r.headers['strict-transport-security']);
});

test('unknown API route -> JSON 404; bad JSON -> 400', async () => {
  assert.equal((await request(app).get('/api/nope')).status, 404);
  const r = await request(app).post('/api/users/login').set('Content-Type', 'application/json').send('{bad');
  assert.equal(r.status, 400);
});

test('CORS allows production origin and blocks others', async () => {
  const ok = await request(app).get('/api/live').set('Origin', 'https://emplocore.vercel.app');
  assert.equal(ok.headers['access-control-allow-origin'], 'https://emplocore.vercel.app');
  const bad = await request(app).get('/api/live').set('Origin', 'https://evil.example.com');
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
});

// ---------- login
test('login: wrong password and unknown email both 401 with same message', async () => {
  const a = await login(DEMO.admin.email, 'wrong-password1');
  const b = await login('nobody@example.com', 'wrong-password1');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.body.error, b.body.error);
});

test('login returns token with token version and mustChangePassword flag', async () => {
  const r = await login(DEMO.hr.email, DEMO.hr.password);
  const payload = JSON.parse(Buffer.from(r.body.token.split('.')[1], 'base64url'));
  assert.equal(payload.tv, 0);
  assert.equal(r.body.user.mustChangePassword, false);
  assert.equal(r.body.user.password, undefined);
});

// ---------- registration / roles
test('public register: employee ok, hr and admin rejected', async () => {
  const s = Date.now();
  let r = await request(app).post('/api/users/register').send({ username: 'Pub Emp', email: `pub.${s}@example.com`, password: 'Password123' });
  assert.equal(r.status, 201);
  r = await request(app).post('/api/users/register').send({ username: 'Pub HR', email: `pubhr.${s}@example.com`, password: 'Password123', role: 'hr' });
  assert.equal(r.status, 403);
  r = await request(app).post('/api/users/register').send({ username: 'Pub Admin', email: `pubad.${s}@example.com`, password: 'Password123', role: 'admin' });
  assert.equal(r.status, 403);
});

test('admin token can create hr and admin; hr token cannot create admin', async () => {
  const s = Date.now();
  let r = await request(app).post('/api/users/register').set(auth(tokens.admin)).send({ username: 'New HR', email: `nhr.${s}@example.com`, password: 'Password123', role: 'hr' });
  assert.equal(r.status, 201);
  r = await request(app).post('/api/users/register').set(auth(tokens.admin)).send({ username: 'New Admin', email: `nad.${s}@example.com`, password: 'Password123', role: 'admin' });
  assert.equal(r.status, 201);
  r = await request(app).post('/api/users/register').set(auth(tokens.hr)).send({ username: 'Sneaky', email: `snk.${s}@example.com`, password: 'Password123', role: 'admin' });
  assert.equal(r.status, 403);
});

test('password policy: short, no digit, and duplicate email rejected', async () => {
  const s = Date.now();
  let r = await request(app).post('/api/users/register').send({ username: 'Shorty', email: `sh.${s}@example.com`, password: 'abc12' });
  assert.equal(r.status, 400);
  r = await request(app).post('/api/users/register').send({ username: 'NoDigit', email: `nd.${s}@example.com`, password: 'abcdefghij' });
  assert.equal(r.status, 400);
  r = await request(app).post('/api/users/register').send({ username: 'Dup', email: DEMO.hr.email, password: 'Password123' });
  assert.equal(r.status, 400);
});

// ---------- authorization
test('route protection by role', async () => {
  assert.equal((await request(app).get('/api/employees')).status, 401);
  assert.equal((await request(app).get('/api/employees').set(auth(tokens.employee))).status, 403);
  assert.equal((await request(app).get('/api/employees').set(auth(tokens.hr))).status, 200);
  assert.equal((await request(app).get('/api/users/all').set(auth(tokens.hr))).status, 403);
  assert.equal((await request(app).get('/api/users/all').set(auth(tokens.admin))).status, 200);
  assert.equal((await request(app).get('/api/audit-logs').set(auth(tokens.hr))).status, 403);
  assert.equal((await request(app).get('/api/audit-logs/recent').set(auth(tokens.hr))).status, 200);
  assert.equal((await request(app).get('/api/users/linkable').set(auth(tokens.employee))).status, 403);
  assert.equal((await request(app).get('/api/employees').set(auth('garbage'))).status, 401);
});

test('audit-log insert route is disabled by default', async () => {
  const r = await request(app).post('/api/audit-logs').set(auth(tokens.admin)).send({ userId: 2, actions: 'X', descriptions: 'forged' });
  assert.equal(r.status, 404);
});

test('admin cannot change own role, delete or deactivate self', async () => {
  const me = (await request(app).get('/api/users/me').set(auth(tokens.admin))).body;
  assert.equal((await request(app).put(`/api/users/${me.id}/role`).set(auth(tokens.admin)).send({ role: 'hr' })).status, 400);
  assert.equal((await request(app).delete(`/api/users/${me.id}`).set(auth(tokens.admin))).status, 400);
  assert.equal((await request(app).put(`/api/users/${me.id}/status`).set(auth(tokens.admin)).send({ is_active: false })).status, 400);
});

async function newUser(role = 'employee') {
  const s = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `u.${s}@example.com`;
  const r = await request(app).post('/api/users/register').set(auth(tokens.admin)).send({ username: `User ${s}`, email, password: 'Password123', role });
  assert.equal(r.status, 201);
  const l = await login(email, 'Password123');
  return { id: r.body.userId, email, token: l.body.token };
}

test('role change takes effect immediately (old token revoked)', async () => {
  const u = await newUser('hr');
  assert.equal((await request(app).get('/api/employees').set(auth(u.token))).status, 200);
  assert.equal((await request(app).put(`/api/users/${u.id}/role`).set(auth(tokens.admin)).send({ role: 'employee' })).status, 200);
  assert.equal((await request(app).get('/api/employees').set(auth(u.token))).status, 401);
  const again = await login(u.email, 'Password123');
  assert.equal((await request(app).get('/api/employees').set(auth(again.body.token))).status, 403);
});

test('deleted user token stops working', async () => {
  const u = await newUser();
  assert.equal((await request(app).delete(`/api/users/${u.id}`).set(auth(tokens.admin))).status, 200);
  assert.equal((await request(app).get('/api/users/profile').set(auth(u.token))).status, 401);
});

// ---------- activation
test('deactivate: login rejected, existing token revoked; reactivate restores', async () => {
  const u = await newUser();
  assert.equal((await request(app).put(`/api/users/${u.id}/status`).set(auth(tokens.employee)).send({ is_active: false })).status, 403);
  assert.equal((await request(app).put(`/api/users/${u.id}/status`).set(auth(tokens.admin)).send({ is_active: 'no' })).status, 400);
  assert.equal((await request(app).put(`/api/users/${u.id}/status`).set(auth(tokens.admin)).send({ is_active: false })).status, 200);
  assert.equal((await request(app).get('/api/users/profile').set(auth(u.token))).status, 401);
  const l = await login(u.email, 'Password123');
  assert.equal(l.status, 403);
  assert.equal(l.body.code, 'ACCOUNT_DEACTIVATED');
  const list = (await request(app).get('/api/users/all').set(auth(tokens.admin))).body;
  assert.equal(list.find((x) => x.id === u.id).is_active, 0);
  assert.equal((await request(app).put(`/api/users/${u.id}/status`).set(auth(tokens.admin)).send({ is_active: true })).status, 200);
  assert.equal((await login(u.email, 'Password123')).status, 200);
});

// ---------- logout / change password
test('logout revokes the token server-side', async () => {
  const u = await newUser();
  assert.equal((await request(app).post('/api/users/logout').set(auth(u.token))).status, 200);
  assert.equal((await request(app).get('/api/users/profile').set(auth(u.token))).status, 401);
});

test('change password: validates, revokes old token, returns working new token', async () => {
  const u = await newUser();
  let r = await request(app).put('/api/users/change-password').set(auth(u.token)).send({ currentPassword: 'wrong-one1', newPassword: 'NewPassword456' });
  assert.equal(r.status, 400);
  r = await request(app).put('/api/users/change-password').set(auth(u.token)).send({ currentPassword: 'Password123', newPassword: 'short' });
  assert.equal(r.status, 400);
  r = await request(app).put('/api/users/change-password').set(auth(u.token)).send({ currentPassword: 'Password123', newPassword: 'NewPassword456' });
  assert.equal(r.status, 200);
  assert.equal((await request(app).get('/api/users/profile').set(auth(u.token))).status, 401);
  assert.equal((await request(app).get('/api/users/profile').set(auth(r.body.token))).status, 200);
  assert.equal((await login(u.email, 'Password123')).status, 401);
  assert.equal((await login(u.email, 'NewPassword456')).status, 200);
});

// ---------- admin password reset
test('temporary password: generated once, forces change before other routes', async () => {
  const u = await newUser();
  assert.equal((await request(app).post(`/api/users/${u.id}/temporary-password`).set(auth(tokens.hr))).status, 403);
  const r = await request(app).post(`/api/users/${u.id}/temporary-password`).set(auth(tokens.admin));
  assert.equal(r.status, 200);
  const temp = r.body.temporaryPassword;
  assert.ok(temp && temp.length >= 8);
  assert.equal((await request(app).get('/api/users/profile').set(auth(u.token))).status, 401); // old session revoked
  const l = await login(u.email, temp);
  assert.equal(l.status, 200);
  assert.equal(l.body.user.mustChangePassword, true);
  const blocked = await request(app).get('/api/users/profile').set(auth(l.body.token));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
  const c = await request(app).put('/api/users/change-password').set(auth(l.body.token)).send({ currentPassword: temp, newPassword: 'MyOwnPass789' });
  assert.equal(c.status, 200);
  assert.equal((await request(app).get('/api/users/profile').set(auth(c.body.token))).status, 200);
});

test('reset link: one-time, expires, rejects bad tokens', async () => {
  const u = await newUser();
  const r = await request(app).post(`/api/users/${u.id}/reset-link`).set(auth(tokens.admin));
  assert.equal(r.status, 201);
  assert.ok(r.body.token.length >= 32);
  assert.equal((await request(app).post('/api/users/reset-password').send({ token: 'nope', newPassword: 'Another123' })).status, 400);
  assert.equal((await request(app).post('/api/users/reset-password').send({ token: r.body.token, newPassword: 'weak' })).status, 400);
  assert.equal((await request(app).post('/api/users/reset-password').send({ token: r.body.token, newPassword: 'Another123' })).status, 200);
  assert.equal((await request(app).post('/api/users/reset-password').send({ token: r.body.token, newPassword: 'Another456' })).status, 400);
  assert.equal((await request(app).get('/api/users/profile').set(auth(u.token))).status, 401);
  assert.equal((await login(u.email, 'Another123')).status, 200);
  // expired link
  const r2 = await request(app).post(`/api/users/${u.id}/reset-link`).set(auth(tokens.admin));
  const conn = await rawConnection();
  await conn.query('UPDATE password_reset_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE used_at IS NULL AND user_id = ?', [u.id]);
  await conn.end();
  assert.equal((await request(app).post('/api/users/reset-password').send({ token: r2.body.token, newPassword: 'Another789' })).status, 400);
});

test('a newer reset link invalidates the older one; stored token is hashed', async () => {
  const u = await newUser();
  const a = await request(app).post(`/api/users/${u.id}/reset-link`).set(auth(tokens.admin));
  const b = await request(app).post(`/api/users/${u.id}/reset-link`).set(auth(tokens.admin));
  assert.equal((await request(app).post('/api/users/reset-password').send({ token: a.body.token, newPassword: 'Another123' })).status, 400);
  const conn = await rawConnection();
  const [rows] = await conn.query('SELECT token_hash FROM password_reset_tokens WHERE user_id = ?', [u.id]);
  await conn.end();
  assert.ok(rows.every((x) => x.token_hash !== b.body.token && x.token_hash.length === 64));
});

// ---------- employees + linking
test('employee CRUD with validation', async () => {
  const s = Date.now();
  let r = await request(app).post('/api/employees').set(auth(tokens.hr)).send({ FullName: 'Kojo Antwi', position: 'Driver', Department: 'Operations', salary: 3000 });
  assert.equal(r.status, 201, JSON.stringify(r.body)); // email optional
  const id = r.body.id;
  r = await request(app).post('/api/employees').set(auth(tokens.hr)).send({ FullName: 'No Dept', position: 'Driver', salary: 3000, email: `nd.${s}@example.com` });
  assert.equal(r.status, 400);
  r = await request(app).put(`/api/employees/${id}`).set(auth(tokens.hr)).send({ FullName: 'Kojo Antwi', position: 'Driver', Department: 'Operations', salary: -5 });
  assert.equal(r.status, 400);
  r = await request(app).put(`/api/employees/${id}`).set(auth(tokens.hr)).send({ FullName: 'Kojo Antwi', position: 'Senior Driver', Department: 'Operations', salary: 3500 });
  assert.equal(r.status, 200);
  assert.equal((await request(app).get(`/api/employees/${id}`).set(auth(tokens.hr))).body.position, 'Senior Driver');
  assert.equal((await request(app).delete(`/api/employees/${id}`).set(auth(tokens.hr))).status, 200);
  assert.equal((await request(app).get(`/api/employees/${id}`).set(auth(tokens.hr))).status, 404);
});

test('employees list supports limit/offset', async () => {
  const r = await request(app).get('/api/employees?limit=2').set(auth(tokens.hr));
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 2);
});

test('link account to employee; employee sees own record; unique; unlink', async () => {
  // seeded link
  let r = await request(app).get('/api/users/me/employee').set(auth(tokens.employee));
  assert.equal(r.status, 200);
  assert.equal(r.body.email, DEMO.employee.email);

  const u = await newUser();
  assert.equal((await request(app).get('/api/users/me/employee').set(auth(u.token))).status, 404);
  const emp = await request(app).post('/api/employees').set(auth(tokens.hr)).send({ FullName: 'Link Target', position: 'Clerk', Department: 'Admin', salary: 2000 });
  assert.equal((await request(app).put(`/api/employees/${emp.body.id}/link`).set(auth(tokens.employee)).send({ user_id: u.id })).status, 403);
  assert.equal((await request(app).put(`/api/employees/${emp.body.id}/link`).set(auth(tokens.hr)).send({ user_id: 999999 })).status, 404);
  assert.equal((await request(app).put(`/api/employees/${emp.body.id}/link`).set(auth(tokens.hr)).send({})).status, 400);
  assert.equal((await request(app).put(`/api/employees/${emp.body.id}/link`).set(auth(tokens.hr)).send({ user_id: u.id })).status, 200);
  r = await request(app).get('/api/users/me/employee').set(auth(u.token));
  assert.equal(r.body.FullName, 'Link Target');
  const other = await request(app).post('/api/employees').set(auth(tokens.hr)).send({ FullName: 'Other Target', position: 'Clerk', Department: 'Admin', salary: 2000 });
  assert.equal((await request(app).put(`/api/employees/${other.body.id}/link`).set(auth(tokens.hr)).send({ user_id: u.id })).status, 409);
  const list = (await request(app).get('/api/employees').set(auth(tokens.hr))).body;
  assert.equal(list.find((e) => e.id === emp.body.id).linked_email, u.email);
  const linkable = (await request(app).get('/api/users/linkable').set(auth(tokens.hr))).body;
  assert.ok(linkable.some((x) => x.id === u.id && x.employee_id === emp.body.id));
  assert.ok(linkable.every((x) => x.password === undefined));
  assert.equal((await request(app).put(`/api/employees/${emp.body.id}/link`).set(auth(tokens.hr)).send({ user_id: null })).status, 200);
  assert.equal((await request(app).get('/api/users/me/employee').set(auth(u.token))).status, 404);
});

test('profile get/update', async () => {
  let r = await request(app).put('/api/users/profile').set(auth(tokens.employee)).send({ first_name: 'Kwame', last_name: 'Mensah', phone: '+233 20 000 0003', address: 'Tema' });
  assert.equal(r.status, 200);
  r = await request(app).get('/api/users/profile').set(auth(tokens.employee));
  assert.equal(r.body.address, 'Tema');
});

test('audit log records security events and is bounded', async () => {
  const r = await request(app).get('/api/audit-logs?limit=1000').set(auth(tokens.admin));
  const actions = new Set(r.body.map((x) => x.actions));
  for (const a of ['LOGIN', 'REGISTER_USER', 'UPDATE_USER_ROLE', 'DELETE_USER', 'DEACTIVATE_USER', 'ACTIVATE_USER', 'LOGOUT', 'CHANGE_PASSWORD', 'RESET_PASSWORD', 'RESET_LINK_CREATED', 'LINK_EMPLOYEE_USER', 'CREATE_EMPLOYEE']) {
    assert.ok(actions.has(a), `missing ${a}`);
  }
  assert.equal((await request(app).get('/api/audit-logs?limit=3').set(auth(tokens.admin))).body.length, 3);
});

test('SQL injection attempts are treated as data', async () => {
  const r = await login("' OR 1=1 -- ", 'x');
  assert.equal(r.status, 401);
  const e = await request(app).get('/api/employees/1%20OR%201=1').set(auth(tokens.hr));
  assert.ok([404, 200].includes(e.status));
  if (e.status === 200) assert.equal(e.body.id, 1);
});
