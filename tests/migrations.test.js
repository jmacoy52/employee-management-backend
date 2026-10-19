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
  await conn.query("INSERT INTO employees (FullName, email, position, Department, salary) VALUES ('Old Emp', 'old.emp@example.com', 'Clerk', 'Admin', 1000)");
  const [[before]] = await conn.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM employees) e');
  const ran = await runMigrations(conn, { log: () => {} });
  assert.deepEqual(ran, ['001_users_account_status.sql', '002_password_reset_tokens.sql', '003_employees_user_link.sql']);
  const [[afterCounts]] = await conn.query('SELECT (SELECT COUNT(*) FROM users) u, (SELECT COUNT(*) FROM employees) e');
  assert.deepEqual(afterCounts, before);
  const [[flags]] = await conn.query('SELECT MIN(is_active) a, MAX(token_version) v, MAX(must_change_password) m FROM users');
  assert.deepEqual({ ...flags }, { a: 1, v: 0, m: 0 });
  assert.deepEqual(await runMigrations(conn, { log: () => {} }), []);
});
