#!/usr/bin/env node
// Creates a platform owner (super admin of every organisation) for a real deployment.
//
//   npm run create-owner -- --email you@example.org --name "Your Name"
//
// Email and name: --email / --name, or OWNER_EMAIL / OWNER_NAME.
// Password: OWNER_PASSWORD, otherwise you are asked for it twice (input hidden). Never printed.
// Owner rules: 12+ characters with a letter and a number, not containing the e-mail name.
// Refuses an e-mail that already has an account. If an owner already exists it refuses unless
// --additional is passed. Without database access (e.g. a locked-down host) use the one-time
// POST /api/platform/bootstrap-owner endpoint instead (docs/PRODUCTION.md).
require('dotenv').config();

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { buildDbConfig } = require('../config/dbConfig');
const { ownerPasswordProblem } = require('../config/roles');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { argValue, promptHidden } = require('./create-admin');

async function createOwner(conn, { email, name, password, additional = false }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  if (!EMAIL_RE.test(cleanEmail)) throw new Error('A valid --email (or OWNER_EMAIL) is required.');
  if (cleanName.length < 2 || cleanName.length > 100) throw new Error('--name (or OWNER_NAME) must be 2 to 100 characters.');
  const problem = ownerPasswordProblem(password, cleanEmail);
  if (problem) throw new Error(problem);
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'");
  if (n > 0 && !additional) throw new Error('A platform owner already exists. Pass --additional to create another one.');
  const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing.length) throw new Error(`An account with email ${cleanEmail} already exists; nothing was changed.`);
  const hash = await bcrypt.hash(String(password), 12);
  const [result] = await conn.query(
    "INSERT INTO users (organization_id, username, email, password, role) VALUES (NULL, ?, ?, ?, 'owner')",
    [cleanName, cleanEmail, hash]
  );
  await conn.query(
    "INSERT INTO audit_logs (organization_id, UserId, actions, descriptions) VALUES (NULL, ?, 'CREATE_OWNER', ?)",
    [result.insertId, `Platform owner ${cleanEmail} created with the create-owner script`]
  );
  return { id: result.insertId, email: cleanEmail };
}

async function main(argv = process.argv.slice(2)) {
  const email = argValue(argv, '--email') || process.env.OWNER_EMAIL;
  const name = argValue(argv, '--name') || process.env.OWNER_NAME;
  let password = process.env.OWNER_PASSWORD;
  if (!password) {
    password = await promptHidden('Password for the platform owner: ', 'OWNER_PASSWORD');
    const again = await promptHidden('Repeat the password: ', 'OWNER_PASSWORD');
    if (password !== again) throw new Error('The passwords do not match.');
  }
  const conn = await mysql.createConnection(buildDbConfig());
  try {
    const owner = await createOwner(conn, { email, name, password, additional: argv.includes('--additional') });
    console.log(`Created platform owner ${owner.email} (user id ${owner.id}). Sign in at /login; you will land on the owner console.`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('create-owner failed:', err.message);
    process.exit(1);
  });
}

module.exports = { createOwner, main };
