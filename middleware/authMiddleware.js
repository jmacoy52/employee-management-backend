const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: 'No token provided.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token.' });
    req.user = user; // Attach user info to request
    next(); //proceeds to the controller
  });
}

function authorizeAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Admin or Super Admin role required.' });
  }
  next();
}

function authorizeSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
  }
  next();
}

function authorizeHR(req, res, next) {
  if (!['hr', 'admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. HR, Admin, or Super Admin role required.' });
  }
  next();
}

module.exports = { authenticateToken, authorizeAdmin, authorizeSuperAdmin, authorizeHR };
