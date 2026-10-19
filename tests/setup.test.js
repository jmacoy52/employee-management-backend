// Production set-up: an empty database by default, demo data only on request,
// demo protection tied to demo mode, and the first admin via `npm run create-admin`.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');
const { resetDatabase, rawConnection } = require('./helpers');

let conn;
after(() => conn && conn.end());

const counts = async () => {
  const [[c]] = await conn.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM employees) e, (SELECT COUNT(*) FROM departments) d');
  return { ...c };
};

test('db init without flags creates an empty database; SEED_DEMO=true loads the demo', async () => {
  await resetDatabase({ seed: false, migrate: false });
  conn = await rawConnection();
  const { main } = require('../scripts/init-db');
  const saved = process.env.SEED_DEMO;
  const log = console.log;
  console.log = () => {};
  try {
    delete process.env.SEED_DEMO;
    await main();
    assert.deepEqual(await counts(), { u: 0, e: 0, d: 0 });
    process.env.SEED_DEMO = 'true';
    await main();
    await main(); // idempotent
    assert.deepEqual(await counts(), { u: 3, e: 8, d: 6 });
    const [[unlinked]] = await conn.query('SELECT COUNT(*) n FROM employees WHERE department_id IS NULL');
    assert.equal(unlinked.n, 0);
  } finally {
    console.log = log;
    if (saved === undefined) delete process.env.SEED_DEMO; else process.env.SEED_DEMO = saved;
  }
});

test('demo protection follows DEMO_MODE', () => {
  const demo = require('../config/demoAccounts');
  const keys = ['DEMO_MODE', 'SEED_DEMO', 'DEMO_PROTECTED_EMAILS'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    keys.forEach((k) => delete process.env[k]);
    assert.equal(demo.demoMode(), 'auto'); // existing deployments keep protecting the seeded logins
    assert.equal(demo.isProtectedEmail('hr@emplocore.demo'), true);
    process.env.SEED_DEMO = 'true';
    assert.equal(demo.demoMode(), 'on');
    process.env.DEMO_MODE = 'false';
    assert.equal(demo.demoMode(), 'off');
    assert.deepEqual(demo.protectedEmails(), []);
    process.env.DEMO_PROTECTED_EMAILS = 'boss@example.org';
    assert.equal(demo.isProtectedEmail('boss@example.org'), false); // demo off wins
    process.env.DEMO_MODE = 'true';
    assert.equal(demo.isProtectedEmail('boss@example.org'), true);
    assert.equal(demo.isProtectedEmail('hr@emplocore.demo'), false);
  } finally {
    keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  }
});

test('createAdmin validates input, hashes the password and refuses duplicates', async () => {
  await resetDatabase({ seed: false });
  const { createAdmin } = require('../scripts/create-admin');
  await assert.rejects(createAdmin(conn, { email: 'bad', name: 'Ama Owusu', password: 'Passw0rd123' }), /valid --email/);
  await assert.rejects(createAdmin(conn, { email: 'ama@example.org', name: 'A', password: 'Passw0rd123' }), /--name/);
  await assert.rejects(createAdmin(conn, { email: 'ama@example.org', name: 'Ama Owusu', password: 'short' }), /at least 8/);
  const admin = await createAdmin(conn, { email: ' Ama@Example.org ', name: 'Ama Owusu', password: 'Passw0rd123' });
  const [[row]] = await conn.query('SELECT email, role, password FROM users WHERE id = ?', [admin.id]);
  assert.equal(row.email, 'ama@example.org');
  assert.equal(row.role, 'admin');
  assert.match(row.password, /^\$2[aby]\$10\$/);
  await assert.rejects(createAdmin(conn, { email: 'ama@example.org', name: 'Ama Owusu', password: 'Passw0rd123' }), /already exists/);
  const [[log]] = await conn.query("SELECT COUNT(*) n FROM audit_logs WHERE actions = 'CREATE_ADMIN'");
  assert.equal(log.n, 1);
});

test('npm run create-admin never prints the password, and the admin can sign in', async () => {
  await resetDatabase({ seed: false });
  const secret = 'Unique-Pass-4821';
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'create-admin.js'), '--email', 'kofi@example.org', '--name', 'Kofi Boateng'], {
    env: { ...process.env, ADMIN_PASSWORD: secret },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(out, /Created admin kofi@example.org/);
  assert.ok(!out.includes(secret));

  // No terminal and no ADMIN_PASSWORD -> clear error, nothing created
  let failed;
  try {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'create-admin.js'), '--email', 'x@example.org', '--name', 'Xx'], {
      env: { ...process.env, ADMIN_PASSWORD: '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    failed = err;
  }
  assert.ok(failed && /ADMIN_PASSWORD/.test(failed.stderr));

  const request = require('supertest');
  const app = require('../server');
  const r = await request(app).post('/api/users/login').send({ email: 'kofi@example.org', password: secret });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  require('../config/db').end();
});
