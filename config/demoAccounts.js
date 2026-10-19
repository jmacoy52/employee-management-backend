// Public demo accounts (shown on the landing page) are protected so visitors cannot lock
// everyone else out: no delete, deactivate, role change, password change/reset or unlinking.
//   DEMO_PROTECTED_EMAILS  comma-separated emails to protect (default: the three seeded demo logins).
//                          Set it to an empty value to turn the protection off.
//   DEMO_MODE              true  = public demo deployment: protection on
//                          false = real deployment: protection off, whatever DEMO_PROTECTED_EMAILS says
//                          unset = automatic (on when SEED_DEMO=true). The default list only names the
//                          seeded demo logins, so it only ever matches when demo data was loaded; a
//                          production database without demo data is unaffected. This keeps an existing
//                          demo deployment protected without an env change.
const db = require('./db');

const DEFAULT_PROTECTED = [
  'admin@emplocore.demo',
  'hr@emplocore.demo',
  'kwame.mensah@emplocore.demo',
];

const DEMO_PROTECTED_MESSAGE = "Demo accounts are protected and can't be changed.";

// 'on' | 'off' | 'auto' (see the header)
function demoMode() {
  const mode = String(process.env.DEMO_MODE || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(mode)) return 'on';
  if (['false', '0', 'no', 'off'].includes(mode)) return 'off';
  return String(process.env.SEED_DEMO).toLowerCase() === 'true' ? 'on' : 'auto';
}

function protectedEmails() {
  if (demoMode() === 'off') return [];
  const raw = process.env.DEMO_PROTECTED_EMAILS;
  const list = raw === undefined ? DEFAULT_PROTECTED : raw.split(',');
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function isProtectedEmail(email) {
  return Boolean(email) && protectedEmails().includes(String(email).trim().toLowerCase());
}

// Is the user with this id one of the protected demo accounts?
function isProtectedUserId(userId) {
  return new Promise((resolve, reject) => {
    if (!protectedEmails().length) return resolve(false);
    db.query('SELECT email FROM users WHERE id = ?', [userId], (err, rows) => {
      if (err) return reject(err);
      resolve(Boolean(rows[0]) && isProtectedEmail(rows[0].email));
    });
  });
}

// Employee record details needed to decide whether a change would break a demo login:
// { protected, email } where protected = the record or its linked account is a demo account.
// organizationId limits the lookup to one organisation (a record elsewhere counts as not found).
function employeeProtection(employeeId, organizationId) {
  return new Promise((resolve, reject) => {
    if (!protectedEmails().length) return resolve({ protected: false, email: null });
    db.query(
      'SELECT e.email, u.email AS linked_email FROM employees e LEFT JOIN users u ON u.id = e.user_id WHERE e.id = ? AND e.organization_id = ?',
      [employeeId, organizationId],
      (err, rows) => {
        if (err) return reject(err);
        const row = rows[0];
        if (!row) return resolve({ protected: false, email: null });
        resolve({ protected: isProtectedEmail(row.email) || isProtectedEmail(row.linked_email), email: row.email });
      }
    );
  });
}

function sendDemoProtected(res) {
  return res.status(403).json({ error: DEMO_PROTECTED_MESSAGE, code: 'DEMO_ACCOUNT_PROTECTED' });
}

module.exports = {
  DEFAULT_PROTECTED,
  DEMO_PROTECTED_MESSAGE,
  demoMode,
  protectedEmails,
  isProtectedEmail,
  isProtectedUserId,
  employeeProtection,
  sendDemoProtected,
};
