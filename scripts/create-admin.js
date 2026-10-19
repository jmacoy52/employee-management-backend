#!/usr/bin/env node
// Creates the first admin account for a new (non-demo) deployment.
//
//   npm run create-admin -- --email admin@yourorg.org --name "Ama Owusu"
//
// Email and name: --email / --name, or ADMIN_EMAIL / ADMIN_NAME.
// Password: ADMIN_PASSWORD, otherwise you are asked for it twice (input hidden).
// The password is never printed or logged. Same rules as sign-up: 8+ characters with a letter and a number.
// Uses the same DB_URL / DB_SSL_* variables as the server (see config/dbConfig.js).
// Refuses to touch an existing account with that email.
require('dotenv').config();

const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { buildDbConfig } = require('../config/dbConfig');
const { passwordProblem } = require('../config/roles');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

// Reads a line from the terminal without echoing it
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('Set ADMIN_PASSWORD (no terminal to ask for it).'));
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        reject(new Error('Cancelled'));
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

// Validates and inserts the admin. Returns { id, email }. Throws with a readable message.
async function createAdmin(conn, { email, name, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  if (!EMAIL_RE.test(cleanEmail)) throw new Error('A valid --email (or ADMIN_EMAIL) is required.');
  if (cleanName.length < 2 || cleanName.length > 100) throw new Error('--name (or ADMIN_NAME) must be 2 to 100 characters.');
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);

  const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing.length) throw new Error(`An account with email ${cleanEmail} already exists; nothing was changed.`);

  const hash = await bcrypt.hash(String(password), 10);
  const [result] = await conn.query(
    "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'admin')",
    [cleanName, cleanEmail, hash]
  );
  await conn.query(
    "INSERT INTO audit_logs (UserId, actions, descriptions) VALUES (?, 'CREATE_ADMIN', ?)",
    [result.insertId, `Admin ${cleanEmail} created with the create-admin script`]
  );
  return { id: result.insertId, email: cleanEmail };
}

async function main(argv = process.argv.slice(2)) {
  const email = argValue(argv, '--email') || process.env.ADMIN_EMAIL;
  const name = argValue(argv, '--name') || process.env.ADMIN_NAME;
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden('Password for the new admin: ');
    const again = await promptHidden('Repeat the password: ');
    if (password !== again) throw new Error('The passwords do not match.');
  }

  const conn = await mysql.createConnection(buildDbConfig());
  try {
    const admin = await createAdmin(conn, { email, name, password });
    console.log(`Created admin ${admin.email} (user id ${admin.id}). Sign in and change the password if it was shared.`);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('create-admin failed:', err.message);
    process.exit(1);
  });
}

module.exports = { createAdmin, main };
