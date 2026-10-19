// Test setup: points the app at a disposable local MySQL database and resets it.
//   TEST_DB_URL   mysql://user:pass@127.0.0.1:3307/emplocore_test?ssl-mode=REQUIRED   (required)
//   DB_SSL_CA_PATH / DB_SSL_CA_BASE64   CA for a TLS-only local server (optional)
// The database named in TEST_DB_URL is wiped. Never point it at production.
const fs = require('fs');
const path = require('path');

if (!process.env.TEST_DB_URL) {
  throw new Error('TEST_DB_URL is not set. See README "Tests".');
}
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.TEST_DB_URL)) {
  throw new Error('TEST_DB_URL must point at a local database (127.0.0.1 or localhost).');
}
process.env.DB_URL = process.env.TEST_DB_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-used-anywhere-else';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '1000';
process.env.ORG_SIGNUP_RATE_LIMIT_MAX = process.env.ORG_SIGNUP_RATE_LIMIT_MAX || '1000';
process.env.ENQUIRY_RATE_LIMIT_MAX = process.env.ENQUIRY_RATE_LIMIT_MAX || '1000';

const mysql = require('mysql2/promise');
const { buildDbConfig } = require('../config/dbConfig');
const { runMigrations } = require('../scripts/migrate');

const DB_DIR = path.join(__dirname, '..', 'db');

async function resetDatabase({ seed = true, migrate = true } = {}) {
  const conn = await mysql.createConnection(buildDbConfig({ multipleStatements: true }));
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS password_reset_tokens, schema_migrations, audit_logs, departments, employees, user_profiles, users, organizations, enquiries, employee_pay_items, employee_pay_details, payslips, payroll_runs, billing_job_runs, billing_notices, billing_coupon_redemptions, billing_coupons, billing_events, billing_payments, billing_checkouts, organization_subscriptions, plans; SET FOREIGN_KEY_CHECKS = 1;');
    await conn.query(fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'));
    if (migrate) await runMigrations(conn, { log: () => {} });
    if (seed) await conn.query(fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8'));
  } finally {
    await conn.end();
  }
}

async function rawConnection() {
  return mysql.createConnection(buildDbConfig({ multipleStatements: true }));
}

const DEMO = {
  admin: { email: 'admin@emplocore.demo', password: 'Admin@EmploCore2026' },
  hr: { email: 'hr@emplocore.demo', password: 'Hr@EmploCore2026' },
  employee: { email: 'kwame.mensah@emplocore.demo', password: 'Staff@EmploCore2026' },
};

// The organisation details the public sign-up form requires (merged into sign-up bodies in tests)
const ORG_DETAILS = { organizationType: 'Private company', sizeRange: '11-50', country: 'Ghana', city: 'Accra', phone: '+233 20 000 0000' };

module.exports = { resetDatabase, rawConnection, DEMO, ORG_DETAILS };
