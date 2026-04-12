const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const UserModel = require('../../models/userModel');
const AuthService = require('../../services/authService');
const AuditLogService = require('../../services/auditLogService');
const EmailService = require('../../services/emailService');
const util = require('util');

class ForgotPasswordController {
  static async forgotPassword(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
      const user = await UserModel.findUserByEmail(email);
      if (!user) {
        AuditLogService.log('FORGOT_PASSWORD_FAILED', `Reset request for non-existent email: ${email}`, {}, req);
        return res.status(404).json({ error: 'User not found' });
      }

      const resetToken = AuthService.generateResetToken(user.id, user.email);

      // Send email
      await EmailService.sendPasswordResetEmail(email, resetToken);

      AuditLogService.log('FORGOT_PASSWORD', `Password reset requested for ${user.email}`, { userId: user.id }, req);

      res.status(200).json({ message: 'Password reset email sent successfully' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  static async resetPassword(req, res) {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });

    try {
      const decoded = AuthService.verifyResetToken(token);
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const queryAsync = util.promisify(db.query).bind(db);
      await queryAsync('UPDATE users SET password = ?, failed_login_attempts = 0, account_locked = FALSE WHERE id = ? AND email = ?', [hashedPassword, decoded.userId, decoded.email]);

      AuditLogService.log('PASSWORD_RESET', `Password reset for ${decoded.email}`, { userId: decoded.userId }, req);

      res.status(200).json({ message: 'Password reset successful' });
    } catch (err) {
      console.error('Reset error:', err);
      res.status(400).json({ error: 'Invalid token' });
    }
  }
}

module.exports = ForgotPasswordController;
