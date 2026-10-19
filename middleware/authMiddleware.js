const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Routes a user may still call while an admin-issued temporary password must be changed.
const PASSWORD_CHANGE_ALLOWED = ['/api/users/change-password', '/api/users/logout', '/api/users/me'];

// Loads the current account for a verified token. The role, active flag and
// token_version come from the database, so role changes, deactivation, logout
// and password changes take effect immediately instead of when the JWT expires.
function loadAccount(payload, callback) {
  db.query(
    'SELECT id, username, email, role, is_active, token_version, must_change_password FROM users WHERE id = ?',
    [payload.id],
    (err, rows) => {
      if (err) return callback(err);
      const account = rows[0];
      if (!account) return callback(null, null, 'Account no longer exists.');
      if (!account.is_active) return callback(null, null, 'Account is deactivated.');
      if ((payload.tv || 0) !== account.token_version) return callback(null, null, 'Session has been signed out. Please sign in again.');
      callback(null, {
        id: account.id,
        username: account.username,
        email: account.email,
        role: account.role,
        mustChangePassword: Boolean(account.must_change_password),
      });
    }
  );
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
      if (!account) return res.status(401).json({ error: reason });
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

module.exports = { authenticateToken, optionalAuth, authorizeAdmin, authorizeHR };
