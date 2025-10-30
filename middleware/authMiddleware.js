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
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  next();
}

function authorizeHR(req, res, next) {
  if (req.user.role !== 'HR') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
}

module.exports = { authenticateToken, authorizeAdmin, authorizeHR };
