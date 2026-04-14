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
  },

  generateTempPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
};

module.exports = AuthService;
