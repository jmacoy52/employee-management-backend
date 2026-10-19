#!/usr/bin/env node
// Creates an organisation admin from the command line (e.g. a client set up by hand).
//
//   npm run create-admin -- --org "Accra Logistics Ltd" --email admin@yourorg.org --name "Ama Owusu"
//
// Organisation: --org "Name" creates a new, already active organisation (ADMIN_ORG works too);
// --org-slug slug adds the admin to an existing organisation instead.
// Usually you do not need this: organisations register on the website and the platform owner
// approves them, or the owner creates them in the owner console.
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
const { uniqueSlug } = require('../config/slug');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : undefined;
}

// Reads a line from the terminal without echoing it
function promptHidden(question, envName = 'ADMIN_PASSWORD') {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error(`Set ${envName} (no terminal to ask for it).`));
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
async function createAdmin(conn, { email, name, password, org, orgSlug }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  if (!EMAIL_RE.test(cleanEmail)) throw new Error('A valid --email (or ADMIN_EMAIL) is required.');
  if (cleanName.length < 2 || cleanName.length > 100) throw new Error('--name (or ADMIN_NAME) must be 2 to 100 characters.');
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);

  const orgName = String(org || '').trim().replace(/\s+/g, ' ');
  const slug = String(orgSlug || '').trim().toLowerCase();
  if (!slug && (orgName.length < 2 || orgName.length > 150)) throw new Error('--org "Organisation name" (2 to 150 characters) or --org-slug is required.');

  const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing.length) throw new Error(`An account with email ${cleanEmail} already exists; nothing was changed.`);

  const hash = await bcrypt.hash(String(password), 10);
  await conn.query('START TRANSACTION');
  try {
    let organizationId;
    if (slug) {
      const [[found]] = await conn.query('SELECT id FROM organizations WHERE slug = ?', [slug]);
      if (!found) throw new Error(`No organisation with slug ${slug}; nothing was changed.`);
      organizationId = found.id;
    } else {
      const newSlug = await uniqueSlug(conn, orgName);
      const [org] = await conn.query(
        "INSERT INTO organizations (name, slug, status, contact_email, approved_at) VALUES (?, ?, 'active', ?, CURRENT_TIMESTAMP)",
        [orgName, newSlug, cleanEmail]
      );
      organizationId = org.insertId;
    }
    const [result] = await conn.query(
      "INSERT INTO users (organization_id, username, email, password, role) VALUES (?, ?, ?, ?, 'admin')",
      [organizationId, cleanName, cleanEmail, hash]
    );
    await conn.query(
      "INSERT INTO audit_logs (organization_id, UserId, actions, descriptions) VALUES (?, ?, 'CREATE_ADMIN', ?)",
      [organizationId, result.insertId, `Admin ${cleanEmail} created with the create-admin script`]
    );
    await conn.query('COMMIT');
    return { id: result.insertId, email: cleanEmail, organizationId };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  }
}

async function main(argv = process.argv.slice(2)) {
  const email = argValue(argv, '--email') || process.env.ADMIN_EMAIL;
  const name = argValue(argv, '--name') || process.env.ADMIN_NAME;
  const org = argValue(argv, '--org') || process.env.ADMIN_ORG;
  const orgSlug = argValue(argv, '--org-slug') || process.env.ADMIN_ORG_SLUG;
  const orgError = (!org && !orgSlug) ? '--org "Organisation name" or --org-slug is required.' : null;
  if (orgError) throw new Error(orgError);
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden('Password for the new admin: ');
    const again = await promptHidden('Repeat the password: ');
    if (password !== again) throw new Error('The passwords do not match.');
  }

  const conn = await mysql.createConnection(buildDbConfig());
  try {
    const admin = await createAdmin(conn, { email, name, password, org, orgSlug });
    console.log(`Created admin ${admin.email} (user id ${admin.id}, organisation id ${admin.organizationId}). Sign in and change the password if it was shared.`);
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

module.exports = { createAdmin, main, argValue, promptHidden };
