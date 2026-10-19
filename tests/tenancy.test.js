// Tenant isolation: two organisations (the seeded demo organisation and "Kumasi Traders").
// Every org-scoped route must behave as if the other organisation's rows did not exist (404),
// lists must only ever contain the caller's organisation, and nothing of the other
// organisation may change.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, rawConnection, DEMO, ORG_DETAILS } = require('./helpers');

let request, app, db, conn;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });
const A = {}; // demo organisation: tokens and ids
const B = {}; // second organisation
const PW = 'Password123';

before(async () => {
  await resetDatabase();
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
  conn = await rawConnection();

  for (const role of ['admin', 'hr', 'employee']) A[role] = (await login(DEMO[role].email, DEMO[role].password)).body.token;
  const [[demoOrg]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  A.orgId = demoOrg.id;
  const [[emp]] = await conn.query("SELECT id, department_id FROM employees WHERE email = 'efua.appiah@emplocore.demo'");
  A.employeeId = emp.id;
  A.departmentId = emp.department_id;
  const [[hrUser]] = await conn.query('SELECT id FROM users WHERE email = ?', [DEMO.hr.email]);
  A.protectedUserId = hrUser.id;
  // An ordinary (unprotected) demo-org account, so 404s cannot be explained by demo protection
  const r = await request(app).post('/api/users/register').set(auth(A.admin)).send({ username: 'Plain Demo User', email: 'plain.demo@example.com', password: PW });
  assert.equal(r.status, 201);
  A.userId = r.body.userId;

  // Organisation B signs up, is approved, and its admin sets up HR, an employee and a department
  const s = await request(app).post('/api/organizations/register').send({ ...ORG_DETAILS, organizationName: 'Kumasi Traders', adminName: 'Yaa Mensah', email: 'yaa@kumasi.example', password: PW });
  assert.equal(s.status, 201);
  await conn.query("UPDATE organizations SET status = 'active' WHERE slug = 'kumasi-traders'");
  const [[bOrg]] = await conn.query("SELECT id FROM organizations WHERE slug = 'kumasi-traders'");
  B.orgId = bOrg.id;
  B.admin = (await login('yaa@kumasi.example', PW)).body.token;
  assert.ok(B.admin);
  assert.equal((await request(app).post('/api/users/register').set(auth(B.admin)).send({ username: 'Kofi HR', email: 'kofi.hr@kumasi.example', password: PW, role: 'hr' })).status, 201);
  B.hr = (await login('kofi.hr@kumasi.example', PW)).body.token;
  const u = await request(app).post('/api/users/register').set(auth(B.admin)).send({ username: 'Ama Staff', email: 'ama@kumasi.example', password: PW });
  B.userId = u.body.userId;
  // Same department name and employee e-mail as the demo organisation: allowed (unique per organisation)
  const d = await request(app).post('/api/departments').set(auth(B.hr)).send({ name: 'Engineering' });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  B.departmentId = d.body.id;
  const e = await request(app).post('/api/employees').set(auth(B.hr)).send({ FullName: 'Ama Staff', email: 'efua.appiah@emplocore.demo', position: 'Clerk', department_id: B.departmentId, salary: 1000 });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  B.employeeId = e.body.id;
});
after(async () => {
  if (conn) await conn.end();
  if (db) db.end();
});

const snapshot = async () => {
  const [rows] = await conn.query(`SELECT
    (SELECT CONCAT_WS('|', FullName, position, salary, department_id, IFNULL(user_id, '-')) FROM employees WHERE id = ?) emp,
    (SELECT CONCAT_WS('|', name, is_active, IFNULL(head_employee_id, '-'), IFNULL(description, '-')) FROM departments WHERE id = ?) dept,
    (SELECT CONCAT_WS('|', role, is_active, token_version, password) FROM users WHERE id = ?) usr,
    (SELECT CONCAT_WS('|', role, is_active, token_version, password) FROM users WHERE id = ?) prot`,
    [A.employeeId, A.departmentId, A.userId, A.protectedUserId]);
  return rows[0];
};

test('organisation B cannot read, change or delete demo-organisation records (404 on every route)', async () => {
  const before = await snapshot();
  const cases = [
    // users (admin)
    ['put', `/api/users/${A.userId}/role`, B.admin, { role: 'hr' }],
    ['put', `/api/users/${A.protectedUserId}/role`, B.admin, { role: 'employee' }],
    ['put', `/api/users/${A.userId}/status`, B.admin, { is_active: false }],
    ['put', `/api/users/${A.protectedUserId}/status`, B.admin, { is_active: false }],
    ['post', `/api/users/${A.userId}/temporary-password`, B.admin, {}],
    ['post', `/api/users/${A.protectedUserId}/temporary-password`, B.admin, {}],
    ['post', `/api/users/${A.userId}/reset-link`, B.admin, {}],
    ['delete', `/api/users/${A.userId}`, B.admin],
    ['delete', `/api/users/${A.protectedUserId}`, B.admin],
    // employees (HR and admin)
    ['get', `/api/employees/${A.employeeId}`, B.hr],
    ['get', `/api/employees/${A.employeeId}`, B.admin],
    ['put', `/api/employees/${A.employeeId}`, B.hr, { FullName: 'Hijacked', position: 'Clerk', department_id: B.departmentId, salary: 1 }],
    ['delete', `/api/employees/${A.employeeId}`, B.hr],
    ['put', `/api/employees/${A.employeeId}/link`, B.hr, { user_id: B.userId }],
    ['put', `/api/employees/${A.employeeId}/link`, B.hr, { user_id: null }],
    ['put', `/api/employees/${B.employeeId}/link`, B.hr, { user_id: A.userId }], // other org's account
    // departments
    ['get', `/api/departments/${A.departmentId}`, B.hr],
    ['put', `/api/departments/${A.departmentId}`, B.hr, { name: 'Hijacked' }],
    ['put', `/api/departments/${A.departmentId}/status`, B.hr, { is_active: false }],
    ['delete', `/api/departments/${A.departmentId}`, B.hr],
    ['post', `/api/departments/${A.departmentId}/employees`, B.hr, { employee_ids: [B.employeeId] }],
    ['post', `/api/departments/${B.departmentId}/employees`, B.hr, { employee_ids: [A.employeeId] }], // other org's employee
    ['delete', `/api/departments/${A.departmentId}/employees/${A.employeeId}`, B.hr],
    ['put', `/api/departments/${A.departmentId}/head`, B.hr, { employee_id: null }],
    ['put', `/api/departments/${B.departmentId}/head`, B.hr, { employee_id: A.employeeId }],
  ];
  for (const [method, url, token, body] of cases) {
    const r = await request(app)[method](url).set(auth(token)).send(body);
    assert.equal(r.status, 404, `${method.toUpperCase()} ${url} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
  assert.deepEqual(await snapshot(), before, 'demo-organisation rows were changed');
});

test('a department of another organisation cannot be chosen for an employee', async () => {
  const r = await request(app).post('/api/employees').set(auth(B.hr)).send({ FullName: 'Kwesi Boat', position: 'Clerk', department_id: A.departmentId, salary: 1 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Department not found');
  const u = await request(app).put(`/api/employees/${B.employeeId}`).set(auth(B.hr)).send({ FullName: 'Ama Staff', position: 'Clerk', department_id: A.departmentId, salary: 1 });
  assert.equal(u.status, 400);
  // A free-text department name creates/uses B's own department, never the demo one
  const t = await request(app).post('/api/employees').set(auth(B.hr)).send({ FullName: 'Kwesi Boat', position: 'Clerk', Department: 'Finance', salary: 1 });
  assert.equal(t.status, 201);
  const [[row]] = await conn.query('SELECT d.organization_id FROM employees e JOIN departments d ON d.id = e.department_id WHERE e.id = ?', [t.body.id]);
  assert.equal(row.organization_id, B.orgId);
});

test('every list only contains the caller organisation (both directions)', async () => {
  const lists = async (admin, hr) => ({
    users: (await request(app).get('/api/users/all').set(auth(admin))).body,
    linkable: (await request(app).get('/api/users/linkable').set(auth(hr))).body,
    employees: (await request(app).get('/api/employees').set(auth(hr))).body,
    departments: (await request(app).get('/api/departments').set(auth(hr))).body,
    audit: (await request(app).get('/api/audit-logs').set(auth(admin))).body,
    recent: (await request(app).get('/api/audit-logs/recent').set(auth(hr))).body,
  });
  const b = await lists(B.admin, B.hr);
  assert.deepEqual(b.users.map((u) => u.email).sort(), ['ama@kumasi.example', 'kofi.hr@kumasi.example', 'yaa@kumasi.example']);
  assert.deepEqual(b.linkable.map((u) => u.email).sort(), ['ama@kumasi.example', 'kofi.hr@kumasi.example', 'yaa@kumasi.example']);
  assert.ok(b.employees.every((e) => e.organization_id === B.orgId) && b.employees.length === 2);
  assert.deepEqual(b.departments.map((d) => d.name).sort(), ['Engineering', 'Finance']);
  assert.equal(b.departments.find((d) => d.name === 'Engineering').employee_count, 1);
  assert.ok(b.audit.length > 0 && b.audit.every((l) => l.organization_id === B.orgId));
  const text = JSON.stringify(b);
  for (const leak of ['kofi.asante@emplocore.demo', 'admin@emplocore.demo', 'Kofi Asante', 'Nana Agyeman', 'Demo data loaded']) assert.ok(!text.includes(leak), `B sees ${leak}`);

  const a = await lists(A.admin, A.hr);
  const atext = JSON.stringify(a);
  for (const leak of ['kumasi.example', 'Kumasi', 'Yaa Mensah']) assert.ok(!atext.includes(leak), `demo sees ${leak}`);
  assert.equal(a.departments.length, 6);
  assert.equal(a.employees.length, 8);
});

test('own employee record and department filter stay inside the organisation', async () => {
  // Link B's employee to B's account, then that account sees its record
  assert.equal((await request(app).put(`/api/employees/${B.employeeId}/link`).set(auth(B.hr)).send({ user_id: B.userId })).status, 200);
  const t = (await login('ama@kumasi.example', PW)).body.token;
  const me = await request(app).get('/api/users/me/employee').set(auth(t));
  assert.equal(me.status, 200);
  assert.equal(me.body.id, B.employeeId);
  const meInfo = await request(app).get('/api/users/me').set(auth(t));
  assert.equal(meInfo.body.organization.name, 'Kumasi Traders');
  const filtered = await request(app).get(`/api/employees?department_id=${A.departmentId}`).set(auth(B.hr));
  assert.deepEqual(filtered.body, []);
});

test('the demo organisation is unaffected and the demo logins still work', async () => {
  for (const role of ['admin', 'hr', 'employee']) {
    const r = await login(DEMO[role].email, DEMO[role].password);
    assert.equal(r.status, 200);
    assert.equal(r.body.user.organization.slug, 'demo');
  }
  const r = await request(app).get(`/api/employees/${A.employeeId}`).set(auth(A.hr));
  assert.equal(r.status, 200);
  assert.equal(r.body.FullName, 'Efua Appiah');
});

test('seat limit: creating or reactivating accounts beyond it is refused', async () => {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM users WHERE organization_id = ? AND is_active = 1', [B.orgId]);
  await conn.query('UPDATE organizations SET seat_limit = ? WHERE id = ?', [n, B.orgId]);
  let r = await request(app).post('/api/users/register').set(auth(B.admin)).send({ username: 'One Too Many', email: 'extra@kumasi.example', password: PW });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'SEAT_LIMIT_REACHED');
  // Free a seat by deactivating Ama, fill it, then Ama cannot be reactivated
  assert.equal((await request(app).put(`/api/users/${B.userId}/status`).set(auth(B.admin)).send({ is_active: false })).status, 200);
  r = await request(app).post('/api/users/register').set(auth(B.admin)).send({ username: 'Fills Seat', email: 'fill@kumasi.example', password: PW });
  assert.equal(r.status, 201);
  r = await request(app).put(`/api/users/${B.userId}/status`).set(auth(B.admin)).send({ is_active: true });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'SEAT_LIMIT_REACHED');
  await conn.query('UPDATE organizations SET seat_limit = NULL WHERE id = ?', [B.orgId]);
  assert.equal((await request(app).put(`/api/users/${B.userId}/status`).set(auth(B.admin)).send({ is_active: true })).status, 200);
});

test('suspended or pending organisation: no login (clear message) and existing tokens are rejected', async () => {
  const token = (await login('kofi.hr@kumasi.example', PW)).body.token;
  assert.equal((await request(app).get('/api/employees').set(auth(token))).status, 200);
  await conn.query("UPDATE organizations SET status = 'suspended' WHERE id = ?", [B.orgId]);
  let r = await login('kofi.hr@kumasi.example', PW);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'ORGANISATION_SUSPENDED');
  assert.match(r.body.error, /suspended/);
  assert.equal(r.body.token, undefined);
  r = await request(app).get('/api/employees').set(auth(token));
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'ORGANISATION_SUSPENDED');
  // Wrong password still gives the generic answer (status reveals nothing to guessers)
  assert.equal((await login('kofi.hr@kumasi.example', 'Wrong-pass-1')).status, 401);
  await conn.query("UPDATE organizations SET status = 'pending' WHERE id = ?", [B.orgId]);
  r = await login('kofi.hr@kumasi.example', PW);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'ORGANISATION_PENDING');
  assert.match(r.body.error, /waiting for approval/);
  assert.equal((await request(app).get('/api/users/me').set(auth(token))).status, 401);
  await conn.query("UPDATE organizations SET status = 'active' WHERE id = ?", [B.orgId]);
  assert.equal((await request(app).get('/api/employees').set(auth(token))).status, 200);
});
