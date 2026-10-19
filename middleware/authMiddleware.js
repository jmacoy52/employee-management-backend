const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: 'No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({ error: expired ? 'Session expired. Please sign in again.' : 'Invalid token.' });
    }
    req.user = user; // Attach user info to request
    next(); //proceeds to the controller
  });
}

// Attaches req.user when a valid token is sent, but never blocks the request.
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
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
