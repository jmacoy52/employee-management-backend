// The three public demo accounts cannot be deleted, deactivated, re-roled, have their
// password changed or reset, or lose their employee link.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, DEMO } = require('./helpers');

let request, app, db, PasswordResetModel, demo;
const tokens = {};
const ids = {};
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });
const MSG = "Demo accounts are protected and can't be changed.";
const q = (sql, params = []) => new Promise((ok, fail) => db.query(sql, params, (e, r) => (e ? fail(e) : ok(r))));

function assertProtected(r) {
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.equal(r.body.error, MSG);
  assert.equal(r.body.code, 'DEMO_ACCOUNT_PROTECTED');
}

before(async () => {
  await resetDatabase();
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');
  PasswordResetModel = require('../models/passwordResetModel');
  demo = require('../config/demoAccounts');
  for (const role of ['admin', 'hr', 'employee']) {
    const r = await login(DEMO[role].email, DEMO[role].password);
    assert.equal(r.status, 200, `login ${role}`);
    tokens[role] = r.body.token;
    ids[role] = r.body.user.id;
  }
  ids.kwameEmployee = (await q('SELECT id FROM employees WHERE email = ?', [DEMO.employee.email]))[0].id;
});
after(() => db && db.end());

test('default protected list is the three demo logins; env overrides it', () => {
  const saved = process.env.DEMO_PROTECTED_EMAILS;
  try {
    delete process.env.DEMO_PROTECTED_EMAILS;
    assert.deepEqual(demo.protectedEmails(), [DEMO.admin.email, DEMO.hr.email, DEMO.employee.email]);
    assert.equal(demo.isProtectedEmail('HR@EmploCore.demo'), true);
    assert.equal(demo.isProtectedEmail('someone@example.com'), false);
    process.env.DEMO_PROTECTED_EMAILS = ' a@x.com , b@y.com ';
    assert.deepEqual(demo.protectedEmails(), ['a@x.com', 'b@y.com']);
    assert.equal(demo.isProtectedEmail(DEMO.hr.email), false);
    process.env.DEMO_PROTECTED_EMAILS = '';
    assert.deepEqual(demo.protectedEmails(), []);
  } finally {
    if (saved === undefined) delete process.env.DEMO_PROTECTED_EMAILS;
    else process.env.DEMO_PROTECTED_EMAILS = saved;
  }
});

test('admin cannot delete, deactivate, re-role or reset the password of a demo account', async () => {
  for (const target of [ids.hr, ids.employee]) {
    assertProtected(await request(app).delete(`/api/users/${target}`).set(auth(tokens.admin)));
    assertProtected(await request(app).put(`/api/users/${target}/status`).set(auth(tokens.admin)).send({ is_active: false }));
    assertProtected(await request(app).put(`/api/users/${target}/role`).set(auth(tokens.admin)).send({ role: 'admin' }));
    assertProtected(await request(app).post(`/api/users/${target}/temporary-password`).set(auth(tokens.admin)));
    assertProtected(await request(app).post(`/api/users/${target}/reset-link`).set(auth(tokens.admin)));
  }
  const rows = await q('SELECT email, role, is_active, must_change_password FROM users WHERE id IN (?, ?) ORDER BY id', [ids.hr, ids.employee]);
  assert.deepEqual(rows.map((r) => [r.role, r.is_active, r.must_change_password]), [['hr', 1, 0], ['employee', 1, 0]]);
});

test('a second (non-demo) admin cannot change the demo admin either', async () => {
  const email = `admin2.${Date.now()}@example.com`;
  assert.equal((await request(app).post('/api/users/register').set(auth(tokens.admin)).send({ username: 'Admin Two', email, password: 'Password123', role: 'admin' })).status, 201);
  const t = (await login(email, 'Password123')).body.token;
  assertProtected(await request(app).delete(`/api/users/${ids.admin}`).set(auth(t)));
  assertProtected(await request(app).put(`/api/users/${ids.admin}/status`).set(auth(t)).send({ is_active: false }));
  assertProtected(await request(app).put(`/api/users/${ids.admin}/role`).set(auth(t)).send({ role: 'employee' }));
  assertProtected(await request(app).post(`/api/users/${ids.admin}/temporary-password`).set(auth(t)));
});

test('own-account rules still come first (self role change / delete -> 400)', async () => {
  assert.equal((await request(app).put(`/api/users/${ids.admin}/role`).set(auth(tokens.admin)).send({ role: 'hr' })).status, 400);
  assert.equal((await request(app).delete(`/api/users/${ids.admin}`).set(auth(tokens.admin))).status, 400);
});

test('demo accounts cannot change their own password', async () => {
  for (const role of ['admin', 'hr', 'employee']) {
    assertProtected(await request(app).put('/api/users/change-password').set(auth(tokens[role]))
      .send({ currentPassword: DEMO[role].password, newPassword: 'Changed12345' }));
  }
});

test('a reset link issued before protection cannot be used on a demo account', async () => {
  const data = await new Promise((ok, fail) => PasswordResetModel.create(ids.hr, ids.admin, 60, (e, d) => (e ? fail(e) : ok(d))));
  assertProtected(await request(app).post('/api/users/reset-password').send({ token: data.token, newPassword: 'Hijacked1234' }));
});

test('demo employee record: no delete, no unlink, no moving the demo account elsewhere; edits allowed', async () => {
  assertProtected(await request(app).delete(`/api/employees/${ids.kwameEmployee}`).set(auth(tokens.hr)));
  assertProtected(await request(app).put(`/api/employees/${ids.kwameEmployee}/link`).set(auth(tokens.hr)).send({ user_id: null }));
  const other = await request(app).post('/api/employees').set(auth(tokens.hr)).send({ FullName: 'Other Person', position: 'Clerk', Department: 'Admin', salary: 2000 });
  assert.equal(other.status, 201);
  assertProtected(await request(app).put(`/api/employees/${other.body.id}/link`).set(auth(tokens.hr)).send({ user_id: ids.hr }));
  assertProtected(await request(app).put(`/api/employees/${other.body.id}/link`).set(auth(tokens.hr)).send({ user_id: ids.employee }));
  // ordinary edits to the record are fine
  const upd = await request(app).put(`/api/employees/${ids.kwameEmployee}`).set(auth(tokens.hr))
    .send({ FullName: 'Kwame Mensah', position: 'Software Engineer', Department: 'Engineering', salary: 9500 });
  assert.equal(upd.status, 200);
  assert.equal((await request(app).delete(`/api/employees/${other.body.id}`).set(auth(tokens.hr))).status, 200);
});

test('a broken demo link can be restored (record -> its own demo account)', async () => {
  await q('UPDATE employees SET user_id = NULL WHERE id = ?', [ids.kwameEmployee]);
  const r = await request(app).put(`/api/employees/${ids.kwameEmployee}/link`).set(auth(tokens.hr)).send({ user_id: ids.employee });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = await request(app).get('/api/users/me/employee').set(auth(tokens.employee));
  assert.equal(me.status, 200);
  assert.equal(me.body.position, 'Software Engineer');
});

test('demo users may still edit their profile, and all demo logins still work', async () => {
  const r = await request(app).put('/api/users/profile').set(auth(tokens.employee))
    .send({ first_name: 'Kwame', last_name: 'Mensah', phone: '+233 20 000 0003', address: 'Adenta, Accra' });
  assert.equal(r.status, 200);
  for (const role of ['admin', 'hr', 'employee']) {
    assert.equal((await login(DEMO[role].email, DEMO[role].password)).status, 200, `login ${role}`);
  }
});
