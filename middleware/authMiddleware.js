const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Routes a user may still call while an admin-issued temporary password must be changed.
const PASSWORD_CHANGE_ALLOWED = ['/api/users/change-password', '/api/users/logout', '/api/users/me'];

// Why an organisation's users are refused (login and existing tokens).
const ORG_BLOCKED = {
  pending: {
    code: 'ORGANISATION_PENDING',
    error: 'Your organisation is waiting for approval. You can sign in once EmploCore has approved it.',
  },
  suspended: {
    code: 'ORGANISATION_SUSPENDED',
    error: 'Your organisation\'s EmploCore account is suspended. Please contact EmploCore.',
  },
  rejected: {
    code: 'ORGANISATION_REJECTED',
    error: 'Your organisation\'s registration was not approved. Please contact EmploCore if you think this is a mistake.',
  },
};

// Returns { code, error } when this user may not use the app because of their organisation, else null.
// Owners have no organisation; every other role must belong to an active one.
function organisationBlock(row) {
  if (row.role === 'owner') return row.organization_id === null ? null : ORG_BLOCKED.suspended;
  if (!row.organization_id || !row.organization_status) return ORG_BLOCKED.suspended;
  const blocked = ORG_BLOCKED[row.organization_status] || null;
  // A rejected registration shows the owner's reason (if any) to the admin who tries to sign in
  if (blocked && row.organization_status === 'rejected' && row.organization_rejection_reason) {
    return { ...blocked, reason: row.organization_rejection_reason };
  }
  return blocked;
}

const ACCOUNT_SQL = `SELECT u.id, u.username, u.email, u.role, u.is_active, u.token_version, u.must_change_password,
    u.organization_id, o.name AS organization_name, o.slug AS organization_slug, o.status AS organization_status, o.rejection_reason AS organization_rejection_reason
  FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
  WHERE u.id = ?`;

// Loads the current account for a verified token. The role, active flag and
// token_version come from the database, so role changes, deactivation, logout
// and password changes take effect immediately instead of when the JWT expires.
// The organisation (and its status) also comes from the database, never from the token or the
// client: every org-scoped query uses req.user.organizationId.
function loadAccount(payload, callback) {
  db.query(ACCOUNT_SQL, [payload.id], (err, rows) => {
    if (err) return callback(err);
    const account = rows[0];
    if (!account) return callback(null, null, { error: 'Account no longer exists.' });
    if (!account.is_active) return callback(null, null, { error: 'Account is deactivated.' });
    if ((payload.tv || 0) !== account.token_version) return callback(null, null, { error: 'Session has been signed out. Please sign in again.' });
    const blocked = organisationBlock(account);
    if (blocked) return callback(null, null, blocked);
    callback(null, {
      id: account.id,
      username: account.username,
      email: account.email,
      role: account.role,
      mustChangePassword: Boolean(account.must_change_password),
      organizationId: account.organization_id,
      organization: account.organization_id
        ? { id: account.organization_id, name: account.organization_name, slug: account.organization_slug }
        : null,
    });
  });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: 'No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({ error: expired ? 'Session expired. Please sign in again.' : 'Invalid token.' });
    }
    loadAccount(user, (dbErr, account, reason) => {
      if (dbErr) {
        console.error('Auth lookup failed:', dbErr.message);
        return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
      }
      if (!account) return res.status(401).json(reason);
      if (account.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(req.originalUrl.split('?')[0])) {
        return res.status(403).json({ error: 'You must change your password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      req.user = account; // Attach user info to request
      next(); //proceeds to the controller
    });
  });
}

// Attaches req.user when a valid token is sent, but never blocks the request.
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next();
    loadAccount(user, (dbErr, account) => {
      if (!dbErr && account && !account.mustChangePassword) req.user = account;
      next();
    });
  });
}

// Platform owner console (/api/platform/*). Owners are not organisation users, so the org
// guards below refuse them and this one refuses everybody else.
function authorizeOwner(req, res, next) {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied. Platform owner role required.' });
  }
  next();
}

function authorizeAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
}

// HR features are available to HR users and admins.
function authorizeHR(req, res, next) {
  if (!['hr', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. HR or Admin role required.' });
  }
  next();
}

module.exports = { authenticateToken, optionalAuth, authorizeOwner, authorizeAdmin, authorizeHR, organisationBlock, ORG_BLOCKED };
