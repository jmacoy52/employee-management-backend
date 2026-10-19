// Upgrading an existing v1 database (as in production) keeps its data and is repeatable.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { resetDatabase, rawConnection } = require('./helpers');
const { runMigrations } = require('../scripts/migrate');

let conn;
after(() => conn && conn.end());

test('migrations upgrade a populated v1 database without data loss and are idempotent', async () => {
  await resetDatabase({ seed: false, migrate: false }); // v1 schema only
  conn = await rawConnection();
  await conn.query("INSERT INTO users (username, email, password, role) VALUES ('Old Admin', 'old.admin@example.com', 'x', 'admin'), ('Old Emp', 'old.emp@example.com', 'x', 'employee')");
  await conn.query("INSERT INTO employees (FullName, email, position, Department, salary) VALUES ('Old Emp', 'old.emp@example.com', 'Clerk', 'Admin', 1000), ('Old Two', NULL, 'Driver', ' admin ', 900), ('Old Three', NULL, 'Cook', 'Kitchen', 800)");
  const [[oldAdmin]] = await conn.query("SELECT id FROM users WHERE email = 'old.admin@example.com'");
  await conn.query("INSERT INTO audit_logs (UserId, actions, descriptions) VALUES (?, 'LOGIN', 'User Old Admin logged in'), (?, 'CREATE_ADMIN', 'First admin created'), (?, 'CREATE_EMPLOYEE', 'Employee added')", [oldAdmin.id, oldAdmin.id, oldAdmin.id]);
  const [[before]] = await conn.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM employees) e');
  const ran = await runMigrations(conn, { log: () => {} });
  assert.deepEqual(ran, ['001_users_account_status.sql', '002_password_reset_tokens.sql', '003_employees_user_link.sql', '004_departments.sql', '005_organizations.sql', '006_org_signup_details_enquiries.sql', '007_payroll.sql', '008_audit_scope_last_login.sql']);
  const [[afterCounts]] = await conn.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM employees) e');
  assert.deepEqual(afterCounts, before);
  const [[flags]] = await conn.query('SELECT MIN(is_active) a, MAX(token_version) v, MAX(must_change_password) m FROM users');
  assert.deepEqual({ ...flags }, { a: 1, v: 0, m: 0 });
  // 004: free-text departments became rows (case/space-insensitive) and every employee is linked
  const [departments] = await conn.query('SELECT name FROM departments ORDER BY name');
  assert.deepEqual(departments.map((d) => d.name), ['Admin', 'Kitchen']);
  const [linked] = await conn.query('SELECT e.Department, d.name FROM employees e LEFT JOIN departments d ON d.id = e.department_id ORDER BY e.id');
  assert.deepEqual(linked.map((r) => [r.Department, r.name]), [['Admin', 'Admin'], ['Admin', 'Admin'], ['Kitchen', 'Kitchen']]);
  // 005: everything moved into one active "EmploCore Demo" organisation
  const [orgs] = await conn.query('SELECT id, name, slug, status, approved_at FROM organizations');
  assert.equal(orgs.length, 1);
  assert.deepEqual([orgs[0].name, orgs[0].slug, orgs[0].status], ['EmploCore Demo', 'demo', 'active']);
  assert.ok(orgs[0].approved_at);
  const [[unassigned]] = await conn.query(`SELECT
    (SELECT COUNT(*) FROM users WHERE organization_id IS NULL) u, (SELECT COUNT(*) FROM employees WHERE organization_id IS NULL) e,
    (SELECT COUNT(*) FROM departments WHERE organization_id IS NULL) d, (SELECT COUNT(*) FROM audit_logs WHERE organization_id IS NULL) a`);
  assert.deepEqual({ ...unassigned }, { u: 0, e: 0, d: 0, a: 0 });
  // The schema now refuses an org-less non-owner and an owner inside an organisation
  await assert.rejects(conn.query("INSERT INTO users (username, email, password, role) VALUES ('X', 'x@example.com', 'x', 'admin')"), /chk_users_org_role/);
  await assert.rejects(conn.query("INSERT INTO users (organization_id, username, email, password, role) VALUES (?, 'Y', 'y@example.com', 'x', 'owner')", [orgs[0].id]), /chk_users_org_role/);
  // Department names and employee e-mails are unique per organisation, not globally
  await conn.query("INSERT INTO organizations (name, slug, status) VALUES ('Other', 'other', 'active')");
  const [[other]] = await conn.query("SELECT id FROM organizations WHERE slug = 'other'");
  await conn.query("INSERT INTO departments (organization_id, name) VALUES (?, 'Admin')", [other.id]);
  await conn.query("INSERT INTO employees (organization_id, FullName, email, position, Department, salary) VALUES (?, 'Old Emp', 'old.emp@example.com', 'Clerk', 'Admin', 1)", [other.id]);
  await assert.rejects(conn.query("INSERT INTO departments (organization_id, name) VALUES (?, 'admin')", [other.id]), /Duplicate/);
  // 008: existing entries get a reader scope; old routine activity stays inside the organisation
  const [scoped] = await conn.query('SELECT actions, scope FROM audit_logs ORDER BY LogId');
  assert.deepEqual(scoped.map((r) => [r.actions, r.scope]), [['LOGIN', 'tenant'], ['CREATE_ADMIN', 'platform'], ['CREATE_EMPLOYEE', 'tenant']]);
  const [[lastLogin]] = await conn.query('SELECT last_login_at FROM users WHERE id = ?', [oldAdmin.id]);
  assert.ok(lastLogin.last_login_at); // backfilled from the LOGIN entry
  assert.deepEqual(await runMigrations(conn, { log: () => {} }), []);
});

test('migrations on an empty database leave it empty (no sample data without SEED_DEMO)', async () => {
  await resetDatabase({ seed: false });
  const c = await rawConnection();
  try {
    const [[counts]] = await c.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM employees) e, (SELECT COUNT(*) FROM departments) d, (SELECT COUNT(*) FROM audit_logs) a, (SELECT COUNT(*) FROM organizations) o');
    assert.deepEqual({ ...counts }, { u: 0, e: 0, d: 0, a: 0, o: 0 });
  } finally {
    await c.end();
  }
});
