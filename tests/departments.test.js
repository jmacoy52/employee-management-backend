// Departments: CRUD, members, head of department, role checks, audit trail and the
// link with employee records (department_id plus the legacy Department name).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, DEMO } = require('./helpers');

let request, app, db;
const tokens = {};
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });
const q = (sql, params = []) => new Promise((ok, fail) => db.query(sql, params, (e, r) => (e ? fail(e) : ok(r))));
const api = (method, url, token) => request(app)[method](url).set(auth(token));

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

test('seeded departments are listed with counts and heads; employees carry department_id', async () => {
  const r = await api('get', '/api/departments', tokens.hr);
  assert.equal(r.status, 200);
  const byName = Object.fromEntries(r.body.map((d) => [d.name, d]));
  assert.deepEqual(Object.keys(byName).sort(), ['Engineering', 'Finance', 'Human Resources', 'Marketing', 'Operations', 'Sales']);
  assert.equal(byName.Engineering.employee_count, 2);
  assert.equal(byName.Engineering.head_name, 'Kwame Mensah');
  const emps = await api('get', '/api/employees', tokens.hr);
  assert.ok(emps.body.every((e) => e.department_id && e.department_name === e.Department));
});

test('only HR and admins can use the departments API', async () => {
  assert.equal((await request(app).get('/api/departments')).status, 401);
  assert.equal((await api('get', '/api/departments', tokens.employee)).status, 403);
  assert.equal((await api('post', '/api/departments', tokens.employee).send({ name: 'Nope' })).status, 403);
  assert.equal((await api('get', '/api/departments', tokens.admin)).status, 200);
});

test('create validates input and rejects duplicate names (case-insensitive)', async () => {
  assert.equal((await api('post', '/api/departments', tokens.hr).send({ name: ' ' })).status, 400);
  assert.equal((await api('post', '/api/departments', tokens.hr).send({ name: 'X'.repeat(101) })).status, 400);
  assert.equal((await api('post', '/api/departments', tokens.hr).send({ name: 'Legal', description: 'd'.repeat(256) })).status, 400);
  const r = await api('post', '/api/departments', tokens.hr).send({ name: '  Legal   Affairs ', description: 'Contracts and compliance' });
  assert.equal(r.status, 201);
  const d = await api('get', `/api/departments/${r.body.id}`, tokens.hr);
  assert.equal(d.body.name, 'Legal Affairs');
  assert.equal(d.body.is_active, 1);
  assert.deepEqual(d.body.members, []);
  assert.equal((await api('post', '/api/departments', tokens.admin).send({ name: 'legal affairs' })).status, 409);
});

test('full lifecycle: assign, set head, rename, deactivate, delete (409 while not empty)', async () => {
  const created = await api('post', '/api/departments', tokens.hr).send({ name: 'Procurement' });
  const id = created.body.id;
  const [yaw] = await q("SELECT id, department_id FROM employees WHERE email = 'yaw.ofori@emplocore.demo'");
  const [kofi] = await q("SELECT id FROM employees WHERE email = 'kofi.asante@emplocore.demo'");

  // head must be a member
  assert.equal((await api('put', `/api/departments/${id}/head`, tokens.hr).send({ employee_id: yaw.id })).status, 400);
  assert.equal((await api('post', `/api/departments/${id}/employees`, tokens.hr).send({ employee_ids: [] })).status, 400);
  assert.equal((await api('post', `/api/departments/${id}/employees`, tokens.hr).send({ employee_ids: [999999] })).status, 404);
  // Kofi heads Finance; moving him clears that
  const assigned = await api('post', `/api/departments/${id}/employees`, tokens.hr).send({ employee_ids: [yaw.id, kofi.id] });
  assert.equal(assigned.status, 200);
  const finance = (await api('get', '/api/departments', tokens.hr)).body.find((d) => d.name === 'Finance');
  assert.equal(finance.head_employee_id, null);
  assert.equal((await api('put', `/api/departments/${id}/head`, tokens.hr).send({ employee_id: yaw.id })).status, 200);

  let d = (await api('get', `/api/departments/${id}`, tokens.hr)).body;
  assert.equal(d.employee_count, 2);
  assert.equal(d.head_name, 'Yaw Ofori');
  assert.deepEqual(d.members.map((m) => m.FullName), ['Kofi Asante', 'Yaw Ofori']);

  // rename keeps the employees' Department copy in sync
  assert.equal((await api('put', `/api/departments/${id}`, tokens.hr).send({ name: 'Purchasing', description: 'Suppliers' })).status, 200);
  const [yawNow] = await q('SELECT Department, department_id FROM employees WHERE id = ?', [yaw.id]);
  assert.deepEqual({ ...yawNow }, { Department: 'Purchasing', department_id: id });
  assert.equal((await api('put', `/api/departments/${id}`, tokens.hr).send({ name: 'Finance' })).status, 409);

  // filter employee list by department
  const filtered = await api('get', `/api/employees?department_id=${id}`, tokens.hr);
  assert.deepEqual(filtered.body.map((e) => e.FullName).sort(), ['Kofi Asante', 'Yaw Ofori']);

  // not empty -> 409; deactivated -> cannot gain members
  assert.equal((await api('delete', `/api/departments/${id}`, tokens.hr)).status, 409);
  assert.equal((await api('put', `/api/departments/${id}/status`, tokens.hr).send({ is_active: 'no' })).status, 400);
  assert.equal((await api('put', `/api/departments/${id}/status`, tokens.hr).send({ is_active: false })).status, 200);
  const [efua] = await q("SELECT id FROM employees WHERE email = 'efua.appiah@emplocore.demo'");
  assert.equal((await api('post', `/api/departments/${id}/employees`, tokens.hr).send({ employee_ids: [efua.id] })).status, 409);

  // unassign (also clears the head), then delete
  assert.equal((await api('delete', `/api/departments/${id}/employees/${yaw.id}`, tokens.hr)).status, 200);
  assert.equal((await api('delete', `/api/departments/${id}/employees/${yaw.id}`, tokens.hr)).status, 404);
  d = (await api('get', `/api/departments/${id}`, tokens.hr)).body;
  assert.equal(d.head_employee_id, null);
  const none = await api('get', '/api/employees?department_id=none', tokens.hr);
  assert.deepEqual(none.body.map((e) => e.FullName), ['Yaw Ofori']);
  assert.equal((await api('delete', `/api/departments/${id}/employees/${kofi.id}`, tokens.admin)).status, 200);
  assert.equal((await api('delete', `/api/departments/${id}`, tokens.admin)).status, 200);
  assert.equal((await api('get', `/api/departments/${id}`, tokens.hr)).status, 404);

  const [logs] = [await q("SELECT actions FROM audit_logs WHERE actions LIKE '%DEPARTMENT%'")];
  const actions = new Set(logs.map((l) => l.actions));
  for (const a of ['CREATE_DEPARTMENT', 'ASSIGN_DEPARTMENT', 'SET_DEPARTMENT_HEAD', 'UPDATE_DEPARTMENT', 'DEACTIVATE_DEPARTMENT', 'UNASSIGN_DEPARTMENT', 'DELETE_DEPARTMENT']) {
    assert.ok(actions.has(a), `audit ${a}`);
  }
});

test('employee create/update use department_id; legacy Department text still works', async () => {
  const depts = (await api('get', '/api/departments', tokens.hr)).body;
  const sales = depts.find((d) => d.name === 'Sales');
  let r = await api('post', '/api/employees', tokens.hr).send({ FullName: 'Ama Serwaa', position: 'Sales Rep', department_id: sales.id, salary: 4000 });
  assert.equal(r.status, 201);
  let [row] = await q('SELECT Department, department_id FROM employees WHERE id = ?', [r.body.id]);
  assert.deepEqual({ ...row }, { Department: 'Sales', department_id: sales.id });
  assert.equal((await api('post', '/api/employees', tokens.hr).send({ FullName: 'No Dept', position: 'Clerk', department_id: 99999, salary: 1 })).status, 400);
  assert.equal((await api('post', '/api/employees', tokens.hr).send({ FullName: 'No Dept', position: 'Clerk', salary: 1 })).status, 400);

  // Older clients send a name: matched case-insensitively, or created
  r = await api('post', '/api/employees', tokens.hr).send({ FullName: 'Kojo Mensah', position: 'Clerk', Department: 'sales', salary: 2500 });
  [row] = await q('SELECT Department, department_id FROM employees WHERE id = ?', [r.body.id]);
  assert.deepEqual({ ...row }, { Department: 'Sales', department_id: sales.id });
  r = await api('post', '/api/employees', tokens.hr).send({ FullName: 'Afia Pokua', position: 'Guard', Department: 'Security', salary: 2000 });
  const security = (await api('get', '/api/departments', tokens.hr)).body.find((d) => d.name === 'Security');
  assert.ok(security);

  // A deactivated department cannot receive employees, but its members can still be edited
  await api('put', `/api/departments/${security.id}/status`, tokens.hr).send({ is_active: false });
  assert.equal((await api('post', '/api/employees', tokens.hr).send({ FullName: 'Late Joiner', position: 'Guard', department_id: security.id, salary: 2000 })).status, 409);
  assert.equal((await api('put', `/api/employees/${r.body.id}`, tokens.hr).send({ FullName: 'Afia Pokua', position: 'Senior Guard', department_id: security.id, salary: 2200 })).status, 200);
  assert.equal((await api('put', `/api/employees/${r.body.id}`, tokens.hr).send({ FullName: 'Afia Pokua', position: 'Guard', department_id: sales.id, salary: 2200 })).status, 200);
  [row] = await q('SELECT Department FROM employees WHERE id = ?', [r.body.id]);
  assert.equal(row.Department, 'Sales');
  assert.equal((await api('put', '/api/employees/999999', tokens.hr).send({ FullName: 'Ghost', position: 'None', department_id: sales.id, salary: 1 })).status, 404);
});

test('a head who moves department via the employee form stops heading the old one', async () => {
  const depts = (await api('get', '/api/departments', tokens.hr)).body;
  const eng = depts.find((d) => d.name === 'Engineering');
  const ops = depts.find((d) => d.name === 'Operations');
  const [efua] = await q("SELECT id FROM employees WHERE email = 'efua.appiah@emplocore.demo'");
  assert.equal((await api('put', `/api/departments/${eng.id}/head`, tokens.hr).send({ employee_id: efua.id })).status, 200);
  assert.equal((await api('put', `/api/employees/${efua.id}`, tokens.hr).send({ FullName: 'Efua Appiah', position: 'QA Engineer', department_id: ops.id, salary: 7800 })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  const engNow = (await api('get', `/api/departments/${eng.id}`, tokens.hr)).body;
  assert.equal(engNow.head_employee_id, null);
});

test('deleting an employee who heads a department clears the head', async () => {
  const sales = (await api('get', '/api/departments', tokens.hr)).body.find((d) => d.name === 'Sales');
  const created = await api('post', '/api/employees', tokens.hr).send({ FullName: 'Temp Head', position: 'Lead', department_id: sales.id, salary: 1000 });
  await api('put', `/api/departments/${sales.id}/head`, tokens.hr).send({ employee_id: created.body.id });
  assert.equal((await api('delete', `/api/employees/${created.body.id}`, tokens.hr)).status, 200);
  assert.equal((await api('get', `/api/departments/${sales.id}`, tokens.hr)).body.head_employee_id, null);
});
