#!/usr/bin/env node
// Creates the EmploCore tables, applies migrations and (optionally) loads demo data.
//
//   DB_URL=mysql://user:pass@host:port/db?ssl-mode=REQUIRED DB_SSL_CA_PATH=./ca.pem node scripts/init-db.js
//
// Options:
//   --schema-only   create tables + migrations, skip demo data (same as the default unless seeding is on)
//   --seed          also load db/seed.sql (demo data). SEED_DEMO=true does the same.
//   --reset         DROP the EmploCore tables first (asks for --yes as well)
//
// Uses the same DB_URL / DB_SSL_* variables as the server (see config/dbConfig.js).
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildDbConfig } = require('../config/dbConfig');
const { runMigrations } = require('./migrate');

const args = new Set(process.argv.slice(2));
const DB_DIR = path.join(__dirname, '..', 'db');

// Demo data is loaded only when asked for, so a deploy never re-creates demo
// accounts that were deleted or rotated in production.
const SEED = !args.has('--schema-only') && (args.has('--seed') || String(process.env.SEED_DEMO).toLowerCase() === 'true');

async function main() {
  const config = buildDbConfig({ multipleStatements: true });
  const target = `${config.user}@${config.host}:${config.port}/${config.database}`;
  console.log(`Connecting to ${target} (SSL: ${config.ssl ? `on, verify=${config.ssl.rejectUnauthorized}, ca=${config.ssl.ca ? 'custom' : 'system'}` : 'off'})`);

  const conn = await mysql.createConnection(config);
  try {
    const [[{ version }]] = await conn.query('SELECT VERSION() AS version');
    const [[ssl]] = await conn.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    console.log(`Connected. MySQL ${version}; TLS cipher: ${ssl?.Value || 'none'}`);

    if (args.has('--reset')) {
      if (!args.has('--yes')) throw new Error('--reset drops all EmploCore tables; add --yes to confirm.');
      console.log('Dropping tables...');
      await conn.query('SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS password_reset_tokens, schema_migrations, audit_logs, employees, user_profiles, users; SET FOREIGN_KEY_CHECKS = 1;');
    }

    console.log('Applying db/schema.sql');
    await conn.query(fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'));

    await runMigrations(conn);

    if (SEED) {
      console.log('Applying db/seed.sql');
      await conn.query(fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8'));
    } else {
      console.log('Skipping demo data (set SEED_DEMO=true or pass --seed to load it)');
    }

    const [counts] = await conn.query(
      'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM employees) AS employees, ' +
      '(SELECT COUNT(*) FROM user_profiles) AS profiles, (SELECT COUNT(*) FROM audit_logs) AS audit_logs'
    );
    console.log('Done. Row counts:', counts[0]);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
main().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
}

module.exports = { main };
