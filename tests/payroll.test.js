// Payroll and payslips: role access, tenant isolation (another organisation's rows are 404),
// employees only ever see their own PUBLISHED payslips, payslips are snapshots, demo protection,
// audit logging and the PDF download.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, rawConnection, DEMO, ORG_DETAILS } = require('./helpers');
const { seedDemoPayroll } = require('../scripts/seed-payroll-demo');

let request, app, db, conn;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const login = (email, password) => request(app).post('/api/users/login').send({ email, password });
const P = (path) => `/api/payroll${path}`;
const A = {}; // demo organisation
const B = {}; // second organisation
const PW = 'Password123';
const actions = async (action) => {
  let rows = [];
  for (let i = 0; i < 20; i += 1) {
    [rows] = await conn.query('SELECT * FROM audit_logs WHERE actions = ? ORDER BY LogId', [action]);
    if (rows.length) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  return rows;
};
// Collects a binary response body (PDF) as a Buffer
const binary = (req) => req.buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

before(async () => {
  await resetDatabase();
  conn = await rawConnection();
  assert.deepEqual(await seedDemoPayroll(conn), { payDetails: 8, payslips: 16 });
  request = require('supertest');
  app = require('../server');
  db = require('../config/db');

  for (const role of ['admin', 'hr', 'employee']) A[role] = (await login(DEMO[role].email, DEMO[role].password)).body.token;
  const [[org]] = await conn.query("SELECT id FROM organizations WHERE slug = 'demo'");
  A.orgId = org.id;
  const [[kwame]] = await conn.query("SELECT id FROM employees WHERE email = 'kwame.mensah@emplocore.demo'");
  const [[efua]] = await conn.query("SELECT id FROM employees WHERE email = 'efua.appiah@emplocore.demo'");
  A.kwameId = kwame.id;
  A.efuaId = efua.id;
  const [[efuaSlip]] = await conn.query("SELECT id FROM payslips WHERE employee_id = ? AND period = '2026-09'", [efua.id]);
  A.efuaSlipId = efuaSlip.id;

  // Organisation B: admin, HR, and an employee with a linked account
  assert.equal((await request(app).post('/api/organizations/register').send({ ...ORG_DETAILS, organizationName: 'Tamale Foods', adminName: 'Abu Issah', email: 'abu@tamale.example', password: PW })).status, 201);
  await conn.query("UPDATE organizations SET status = 'active' WHERE slug = 'tamale-foods'");
  B.admin = (await login('abu@tamale.example', PW)).body.token;
  assert.equal((await request(app).post('/api/users/register').set(auth(B.admin)).send({ username: 'Fati HR', email: 'fati@tamale.example', password: PW, role: 'hr' })).status, 201);
  B.hr = (await login('fati@tamale.example', PW)).body.token;
  const u = await request(app).post('/api/users/register').set(auth(B.admin)).send({ username: 'Salifu Staff', email: 'salifu@tamale.example', password: PW });
  const e = await request(app).post('/api/employees').set(auth(B.hr)).send({ FullName: 'Salifu Staff', email: 'salifu@tamale.example', position: 'Storekeeper', Department: 'Stores', salary: 2000 });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  B.employeeId = e.body.id;
  assert.equal((await request(app).put(`/api/employees/${B.employeeId}/link`).set(auth(B.hr)).send({ user_id: u.body.userId })).status, 200);
  B.employee = (await login('salifu@tamale.example', PW)).body.token;
});
after(async () => {
  if (conn) await conn.end();
  if (db) db.end();
});

test('the demo employee sees the seeded published payslips, newest first, with view and PDF', async () => {
  const list = await request(app).get(P('/my-payslips')).set(auth(A.employee));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((p) => p.period), ['2026-09', '2026-08']);
  assert.ok(list.body.every((p) => p.status === 'published' && p.employee_name === 'Kwame Mensah'));
  assert.equal(list.body[0].pay_date, '2026-09-30');

  const view = await request(app).get(P(`/my-payslips/${list.body[0].id}`)).set(auth(A.employee));
  assert.equal(view.status, 200);
  const s = view.body;
  assert.equal(s.organization_name, 'EmploCore Demo');
  assert.match(s.reference, /^PS-202609-[2-9A-HJ-NP-Z]{6}$/);
  assert.deepEqual([s.employee_number, s.job_title, s.department_name], [`EMP-${String(A.kwameId).padStart(4, '0')}`, 'Software Engineer', 'Engineering']);
  // 9,500 basic + 1,500 allowances, welfare 50 (see the worked example in payrollCalc.test.js)
  assert.deepEqual([s.gross_pesewas, s.ssnit_employee_pesewas, s.paye_pesewas, s.net_pesewas, s.ssnit_employer_pesewas], [1100000, 52250, 222388, 820362, 123500]);
  assert.deepEqual(s.lines.allowances.map((a) => a.name), ['Transport', 'Housing', 'Lunch']);
  assert.match(s.lines.rules.payeTable, /Act 1178/);
  assert.equal(list.body[1].paye_pesewas < s.paye_pesewas, true); // August: the old bands
  assert.equal(s.line_items, undefined);

  const pdf = await binary(request(app).get(P(`/my-payslips/${s.id}/pdf`)).set(auth(A.employee)));
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.match(pdf.headers['content-disposition'], new RegExp(`attachment; filename="payslip-2026-09-${s.reference}\\.pdf"`));
  assert.equal(pdf.headers['cache-control'], 'private, no-store');
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.body.length > 5000);
});

test('employees cannot use HR payroll endpoints; HR and admins can; signed-out callers get 401', async () => {
  const hrOnly = [
    ['get', P('/tax-rules')], ['post', P('/preview')], ['get', P('/pay-details')],
    ['get', P(`/employees/${A.kwameId}/pay-details`)], ['put', P(`/employees/${A.kwameId}/pay-details`)],
    ['get', P('/runs')], ['post', P('/runs')], ['get', P('/runs/2026-09')], ['post', P('/runs/2026-09/publish')],
    ['get', P(`/payslips/${A.efuaSlipId}`)], ['get', P(`/payslips/${A.efuaSlipId}/pdf`)], ['delete', P(`/payslips/${A.efuaSlipId}`)],
  ];
  for (const [method, url] of hrOnly) {
    assert.equal((await request(app)[method](url).set(auth(A.employee)).send({})).status, 403, `${method} ${url}`);
    assert.equal((await request(app)[method](url)).status, 401, `${method} ${url} signed out`);
  }
  assert.equal((await request(app).get(P('/my-payslips'))).status, 401);
  for (const token of [A.hr, A.admin]) {
    const runs = await request(app).get(P('/runs')).set(auth(token));
    assert.equal(runs.status, 200);
    assert.deepEqual(runs.body.map((r) => [r.period, r.payslip_count, r.published_count, r.draft_count]), [['2026-09', 8, 8, 0], ['2026-08', 8, 8, 0]]);
  }
  const rules = await request(app).get(P('/tax-rules')).set(auth(A.hr));
  assert.equal(rules.body.paye[0].effectiveFrom, '2026-09-01');
  assert.equal(rules.body.earliestPeriod, '2025-01');
});

test('the payroll month shows every payslip with totals', async () => {
  const r = await request(app).get(P('/runs/2026-09')).set(auth(A.hr));
  assert.equal(r.status, 200);
  assert.equal(r.body.payslips.length, 8);
  assert.equal(r.body.pay_date, '2026-09-30');
  const net = r.body.payslips.reduce((t, p) => t + p.net_pesewas, 0);
  assert.equal(r.body.totals.net_pesewas, net);
  const [[sum]] = await conn.query("SELECT SUM(net_pesewas) AS net FROM payslips WHERE period = '2026-09' AND organization_id = ?", [A.orgId]);
  assert.equal(Number(sum.net), net);
  const list = await request(app).get(P('/runs')).set(auth(A.hr));
  assert.equal(list.body[0].net, net);
  assert.equal((await request(app).get(P('/runs/2026-07')).set(auth(A.hr))).status, 404);
  assert.equal((await request(app).get(P('/runs/July')).set(auth(A.hr))).status, 404);
});

test('drafts are invisible to employees until published; publishing is audited', async () => {
  const run = await request(app).post(P('/runs')).set(auth(A.hr)).send({ period: '2026-10', payDate: '2026-10-30' });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.deepEqual([run.body.created, run.body.skipped], [8, 0]);
  const [[draft]] = await conn.query("SELECT id, status FROM payslips WHERE employee_id = ? AND period = '2026-10'", [A.kwameId]);
  assert.equal(draft.status, 'draft');
  assert.equal((await request(app).get(P('/my-payslips')).set(auth(A.employee))).body.length, 2);
  assert.equal((await request(app).get(P(`/my-payslips/${draft.id}`)).set(auth(A.employee))).status, 404);
  assert.equal((await request(app).get(P(`/my-payslips/${draft.id}/pdf`)).set(auth(A.employee))).status, 404);
  // HR sees drafts
  assert.equal((await request(app).get(P(`/payslips/${draft.id}`)).set(auth(A.hr))).body.status, 'draft');
  assert.equal((await request(app).get(P(`/payslips/${draft.id}/pdf`)).set(auth(A.hr))).headers['content-type'], 'application/pdf');

  // Running the month again skips everyone who already has a payslip
  const again = await request(app).post(P('/runs')).set(auth(A.hr)).send({ period: '2026-10', payDate: '2026-10-30' });
  assert.deepEqual([again.status, again.body.created, again.body.skipped], [200, 0, 8]);

  // Publish only Kwame's first, then the rest
  const one = await request(app).post(P('/runs/2026-10/publish')).set(auth(A.hr)).send({ payslipIds: [draft.id] });
  assert.deepEqual([one.status, one.body.published], [200, 1]);
  assert.equal((await request(app).get(P('/my-payslips')).set(auth(A.employee))).body[0].period, '2026-10');
  const rest = await request(app).post(P('/runs/2026-10/publish')).set(auth(A.admin)).send({});
  assert.equal(rest.body.published, 7);
  assert.equal((await request(app).post(P('/runs/2026-10/publish')).set(auth(A.hr)).send({})).body.published, 0);

  const runLogs = await actions('RUN_PAYROLL');
  assert.equal(runLogs.length, 1);
  assert.equal(runLogs[0].organization_id, A.orgId);
  assert.match(runLogs[0].descriptions, /October 2026 .*8 draft payslip/);
  const pubLogs = await actions('PUBLISH_PAYSLIPS');
  for (let i = 0; i < 20 && pubLogs.length < 2; i += 1) { await new Promise((r) => setTimeout(r, 25)); pubLogs.splice(0, pubLogs.length, ...(await actions('PUBLISH_PAYSLIPS'))); }
  assert.deepEqual(pubLogs.map((l) => l.descriptions.match(/^\d+/)[0]), ['1', '7']);

  // A published payslip cannot be deleted
  assert.equal((await request(app).delete(P(`/payslips/${draft.id}`)).set(auth(A.hr))).status, 409);
});

test("an employee cannot open a colleague's payslip (404)", async () => {
  assert.equal((await request(app).get(P(`/my-payslips/${A.efuaSlipId}`)).set(auth(A.employee))).status, 404);
  assert.equal((await request(app).get(P(`/my-payslips/${A.efuaSlipId}/pdf`)).set(auth(A.employee))).status, 404);
  assert.equal((await request(app).get(P('/my-payslips/abc')).set(auth(A.employee))).status, 404);
  // HR and admins see the demo organisation's accounts, who have no employee record: empty list
  assert.deepEqual((await request(app).get(P('/my-payslips')).set(auth(A.hr))).body, []);
});

test('demo protection: the demo employee\'s pay details cannot be changed; other demo employees can', async () => {
  const kwame = await request(app).get(P(`/employees/${A.kwameId}/pay-details`)).set(auth(A.hr));
  assert.equal(kwame.status, 200);
  assert.equal(kwame.body.demoProtected, true);
  assert.equal(kwame.body.basic, 950000);
  const blocked = await request(app).put(P(`/employees/${A.kwameId}/pay-details`)).set(auth(A.admin)).send({ basicSalary: '1.00' });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'DEMO_ACCOUNT_PROTECTED');
  const [[still]] = await conn.query('SELECT basic_salary_pesewas FROM employee_pay_details WHERE employee_id = ?', [A.kwameId]);
  assert.equal(still.basic_salary_pesewas, 950000);

  const ok = await request(app).put(P(`/employees/${A.efuaId}/pay-details`)).set(auth(A.hr))
    .send({ basicSalary: '7,900.00', allowances: [{ name: 'Transport', amount: '400' }], deductions: [], bankName: 'Ecobank Ghana', bankAccount: '1441000273916' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.payDetails.basic, 790000);
  assert.equal(ok.body.payDetails.demoProtected, undefined);
});

test('payslips are snapshots: later pay changes do not alter them; drafts can be deleted and re-run', async () => {
  const put = (body) => request(app).put(P(`/employees/${B.employeeId}/pay-details`)).set(auth(B.hr)).send(body);
  // Before any pay details, the employee record's salary is the basic
  const list0 = await request(app).get(P('/pay-details')).set(auth(B.hr));
  assert.deepEqual(list0.body.map((s) => [s.employeeId, s.basic, s.saved]), [[B.employeeId, 200000, false]]);

  assert.equal((await put({ basicSalary: '3000', allowances: [{ name: 'Housing', amount: '1000.00' }], deductions: [{ name: 'Loan', amount: '200' }], bankName: 'GCB Bank', bankAccount: '1021 1300 4567', ssnitNumber: 'c123456789012' })).status, 200);
  const [[emp]] = await conn.query('SELECT salary FROM employees WHERE id = ?', [B.employeeId]);
  assert.equal(Number(emp.salary), 3000); // employees.salary follows the basic
  const audit = await actions('SET_PAY_DETAILS');
  assert.ok(audit.some((l) => /Salifu Staff/.test(l.descriptions) && /basic GHS 2,000.00 -> 3,000.00/.test(l.descriptions)));

  assert.equal((await request(app).post(P('/runs')).set(auth(B.hr)).send({ period: '2026-09', payDate: '2026-09-29' })).status, 201);
  assert.equal((await request(app).post(P('/runs/2026-09/publish')).set(auth(B.hr)).send({})).body.published, 1);
  const [mine] = (await request(app).get(P('/my-payslips')).set(auth(B.employee))).body;
  // 3,000 basic + 1,000 housing, loan 200: net 3,071.75 (see payrollCalc.test.js)
  assert.deepEqual([mine.gross_pesewas, mine.net_pesewas, mine.period], [400000, 307175, '2026-09']);

  // Pay rise after publishing: the September payslip is unchanged
  assert.equal((await put({ basicSalary: '5000', allowances: [], deductions: [] })).status, 200);
  const view = (await request(app).get(P(`/my-payslips/${mine.id}`)).set(auth(B.employee))).body;
  assert.deepEqual([view.basic_pesewas, view.net_pesewas, view.bank_name, view.ssnit_number], [300000, 307175, 'GCB Bank', 'C123456789012']);
  assert.deepEqual(view.lines.deductions, [{ name: 'Loan', amount: 20000 }]);

  // October uses the new pay; a draft can be deleted (with its empty run) and run again
  const oct = await request(app).post(P('/runs')).set(auth(B.hr)).send({ period: '2026-10', payDate: '2026-10-30', employeeIds: [B.employeeId] });
  assert.equal(oct.body.created, 1);
  const [[octSlip]] = await conn.query("SELECT id, basic_pesewas FROM payslips WHERE employee_id = ? AND period = '2026-10'", [B.employeeId]);
  assert.equal(octSlip.basic_pesewas, 500000);
  assert.equal((await request(app).delete(P(`/payslips/${octSlip.id}`)).set(auth(B.hr))).status, 200);
  assert.equal((await conn.query("SELECT COUNT(*) AS n FROM payroll_runs WHERE period = '2026-10' AND organization_id = (SELECT organization_id FROM employees WHERE id = ?)", [B.employeeId]))[0][0].n, 0);
  assert.ok((await actions('DELETE_PAYSLIP')).some((l) => /Salifu Staff, October 2026/.test(l.descriptions)));
  assert.equal((await request(app).post(P('/runs')).set(auth(B.hr)).send({ period: '2026-10', payDate: '2026-10-30' })).body.created, 1);
});

test('tenant isolation: another organisation\'s employees, runs and payslips are 404', async () => {
  const [[bSlip]] = await conn.query("SELECT id FROM payslips WHERE employee_id = ? AND period = '2026-09'", [B.employeeId]);
  // Organisation B's HR against demo rows
  for (const [method, url, body] of [
    ['get', P(`/payslips/${A.efuaSlipId}`)], ['get', P(`/payslips/${A.efuaSlipId}/pdf`)], ['delete', P(`/payslips/${A.efuaSlipId}`)],
    ['get', P(`/employees/${A.efuaId}/pay-details`)], ['put', P(`/employees/${A.efuaId}/pay-details`), { basicSalary: '1' }],
    ['post', P('/runs'), { period: '2026-11', payDate: '2026-11-27', employeeIds: [A.efuaId] }],
    ['get', P('/runs/2026-08')], ['post', P('/runs/2026-08/publish'), {}],
  ]) {
    assert.equal((await request(app)[method](url).set(auth(B.hr)).send(body)).status, 404, `${method} ${url}`);
  }
  // ... and the demo organisation's HR against B's payslip
  assert.equal((await request(app).get(P(`/payslips/${bSlip.id}`)).set(auth(A.hr))).status, 404);
  assert.equal((await request(app).get(P(`/employees/${B.employeeId}/pay-details`)).set(auth(A.admin))).status, 404);
  assert.equal((await request(app).get(P(`/my-payslips/${bSlip.id}`)).set(auth(A.employee))).status, 404);
  assert.equal((await request(app).get(P(`/my-payslips/${A.efuaSlipId}`)).set(auth(B.employee))).status, 404);

  // Lists only ever contain the caller's organisation
  const bRuns = (await request(app).get(P('/runs')).set(auth(B.hr))).body;
  assert.deepEqual(bRuns.map((r) => [r.period, r.payslip_count]), [['2026-10', 1], ['2026-09', 1]]);
  const bPay = (await request(app).get(P('/pay-details')).set(auth(B.hr))).body;
  assert.deepEqual(bPay.map((s) => s.employeeId), [B.employeeId]);
  const aPay = (await request(app).get(P('/pay-details')).set(auth(A.hr))).body;
  assert.equal(aPay.length, 8);
  assert.ok(!aPay.some((s) => s.employeeId === B.employeeId));
  const [[demoSep]] = await conn.query("SELECT COUNT(*) AS n FROM payslips WHERE organization_id = ? AND period = '2026-08'", [A.orgId]);
  assert.equal(demoSep.n, 8); // nothing of the demo organisation changed
  // The other organisation's PDF names the right organisation
  const pdf = await binary(request(app).get(P(`/my-payslips/${bSlip.id}/pdf`)).set(auth(B.employee)));
  assert.equal(pdf.status, 200);
});

test('validation of pay details and payroll runs', async () => {
  const put = (body) => request(app).put(P(`/employees/${B.employeeId}/pay-details`)).set(auth(B.hr)).send(body);
  for (const body of [
    {}, { basicSalary: 'abc' }, { basicSalary: '-1' }, { basicSalary: '10.555' }, { basicSalary: '100', currency: 'USD' },
    { basicSalary: '100', allowances: [{ name: '', amount: '5' }] }, { basicSalary: '100', allowances: [{ name: 'Fuel', amount: '0' }] },
    { basicSalary: '100', deductions: 'loan' }, { basicSalary: '100', allowances: Array.from({ length: 21 }, (_, i) => ({ name: `A${i}`, amount: '1' })) },
    { basicSalary: '100', bankAccount: '12' }, { basicSalary: '100', ssnitNumber: 'no spaces allowed' },
  ]) {
    assert.equal((await put(body)).status, 400, JSON.stringify(body).slice(0, 80));
  }
  const run = (body) => request(app).post(P('/runs')).set(auth(B.hr)).send(body);
  for (const body of [
    {}, { period: '2026-9', payDate: '2026-09-30' }, { period: '2024-12', payDate: '2024-12-31' }, { period: '2031-01', payDate: '2031-01-31' },
    { period: '2026-09', payDate: '30/09/2026' }, { period: '2026-09', payDate: '2026-09-30', employeeIds: [] }, { period: '2026-09', payDate: '2026-09-30', employeeIds: ['x'] },
  ]) {
    assert.equal((await run(body)).status, 400, JSON.stringify(body));
  }
  // An employee with a zero salary is left out and reported
  assert.equal((await put({ basicSalary: '0' })).status, 200);
  const none = await run({ period: '2026-08', payDate: '2026-08-28' });
  assert.equal(none.status, 400);
  assert.match(none.body.error, /No selected employee has a salary/);

  const preview = await request(app).post(P('/preview')).set(auth(B.hr)).send({ period: '2026-09', basicSalary: '9500', allowances: [{ name: 'Transport', amount: '400' }, { name: 'Housing', amount: '800' }, { name: 'Lunch', amount: '300' }], deductions: [{ name: 'Staff welfare', amount: '50' }] });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.net, 820362);
  assert.equal((await request(app).post(P('/preview')).set(auth(B.hr)).send({ period: '2024-01', basicSalary: '1' })).status, 400);
});
