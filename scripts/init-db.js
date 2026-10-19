#!/usr/bin/env node
// Creates the EmploCore tables and loads demo data.
//
//   DB_URL=mysql://user:pass@host:port/db?ssl-mode=REQUIRED DB_SSL_CA_PATH=./ca.pem node scripts/init-db.js
//
// Options:
//   --schema-only   create tables, skip demo data
//   --reset         DROP the EmploCore tables first (asks for --yes as well)
//
// Uses the same DB_URL / DB_SSL_* variables as the server (see config/dbConfig.js).
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildDbConfig } = require('../config/dbConfig');

const args = new Set(process.argv.slice(2));
const DB_DIR = path.join(__dirname, '..', 'db');

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
      await conn.query('SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS audit_logs, employees, user_profiles, users; SET FOREIGN_KEY_CHECKS = 1;');
    }

    console.log('Applying db/schema.sql');
    await conn.query(fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'));

    if (!args.has('--schema-only')) {
      console.log('Applying db/seed.sql');
      await conn.query(fs.readFileSync(path.join(DB_DIR, 'seed.sql'), 'utf8'));
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

main().catch((err) => {
  console.error('init-db failed:', err.message);
  process.exit(1);
});
