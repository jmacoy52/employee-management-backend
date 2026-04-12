const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../../models/userModel');
const AuthService = require('../../services/authService');
const AuditLogService = require('../../services/auditLogService');

const JWT_SECRET = process.env.JWT_SECRET;

class LoginController {
  static async login(req, res) {
    const { email, password } = req.body;

    // Payload validation for security
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
      // Fetch user by email
      const user = await UserModel.findUserByEmail(email);
      if (!user) {
        // Fire-and-forget logging for failed attempt
        AuditLogService.log('LOGIN_FAILED', `Failed login attempt for email: ${email}`, {}, req);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if account is locked
      if (user.account_locked) {
        AuditLogService.log('LOGIN_BLOCKED', `Login attempt on locked account: ${email}`, { userId: user.id }, req);
        return res.status(423).json({ error: 'Account is locked due to too many failed attempts. Please reset your password.' });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        // Increment failed attempts
        const newAttempts = (user.failed_login_attempts || 0) + 1;
        const shouldLock = newAttempts >= 3;
        UserModel.updateFailedAttempts(user.id, newAttempts, shouldLock, (err) => {
          if (err) console.error('Error updating attempts:', err);
        });

        // Fire-and-forget logging
        AuditLogService.log('LOGIN_FAILED', `Failed login attempt for email: ${email}`, { userId: user.id, attempts: newAttempts }, req);
        
        // Provide specific error message based on attempts
        const remainingAttempts = 3 - newAttempts;
        if (shouldLock) {
          return res.status(423).json({ 
            error: 'Account locked due to too many failed attempts. Please reset your password.',
            reason: 'account_locked',
            attempts: newAttempts
          });
        } else {
          return res.status(401).json({ 
            error: `Invalid credentials. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`,
            reason: 'invalid_credentials',
            attempts: newAttempts,
            remaining: remainingAttempts
          });
        }
      }

      // Reset failed attempts on success
      if (user.failed_login_attempts > 0) {
        UserModel.updateFailedAttempts(user.id, 0, false, (err) => {
          if (err) console.error('Error resetting attempts:', err);
        });
      }

      // Check role access (allow all valid roles: admin, hr, employee)
      if (!AuthService.isValidRole(user, ['admin', 'hr', 'employee'])) {
        // Fire-and-forget logging
        AuditLogService.log('LOGIN_DENIED', `Invalid role ${user.role} denied login for ${user.email}`, { userId: user.id }, req);
        return res.status(401).json({ error: 'Access denied. Invalid user role.' });
      }

      // Generate JWT token
      const token = jwt.sign({ id: user.id, email: user.email, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

// Send response immediately with user data
      res.status(200).json({ 
        message: 'Login successful', 
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile_picture: user.profile_picture
        }
      });

      // Log success asynchronously (non-blocking)
      AuditLogService.log('LOGIN_SUCCESS', `User ${user.username || user.email} logged in`, { userId: user.id }, req);

    } catch (err) {
      // Log error internally, but don't expose details
      console.error('Login error:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = LoginController;
