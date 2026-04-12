const AuthService = {
  isValidRole(user, allowedRoles) {
    return allowedRoles.includes(user.role);
  },

  generateResetToken(userId, email) {
    const jwt = require('jsonwebtoken');
    return jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  },

  verifyResetToken(token) {
    const jwt = require('jsonwebtoken');
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      throw new Error('Invalid token');
    }
  }
};

module.exports = AuthService;
