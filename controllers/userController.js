const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const UserProfileModel = require('../models/userProfileModel');
const db = require('../config/db');

const crypto = require('crypto');
const AuditLogModel = require('../models/auditLogModel');
const PasswordResetModel = require('../models/passwordResetModel');
const { ROLES, PUBLIC_SIGNUP_ROLES, DEFAULT_ROLE, passwordProblem } = require('../config/roles');
const { isProtectedEmail, isProtectedUserId, sendDemoProtected } = require('../config/demoAccounts');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const RESET_LINK_TTL_MINUTES = Number(process.env.RESET_LINK_TTL_MINUTES) || 60;
// Compared against when the email is unknown, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);

// Signs a JWT. "tv" (token_version) lets the server revoke tokens before they expire.
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function audit(userId, actions, descriptions) {
  AuditLogModel.insertLog({ userId, actions, descriptions }, (logErr) => {
    if (logErr) console.error(`Failed to log ${actions}:`, logErr.message);
  });
}

class UserController {
  // Register new user.
  // Public sign-up may only create 'employee' or 'hr' accounts; a signed-in admin
  // (optionalAuth sets req.user) may also create 'admin' accounts.
  static async register(req, res) {
    const { username, email, password } = req.body;
    const role = (req.body.role || DEFAULT_ROLE).toString().trim().toLowerCase();
    const isAdmin = req.user?.role === 'admin';

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    const problem = passwordProblem(password);
    if (problem) {
      return res.status(400).json({ error: problem });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
    }
    if (!isAdmin && !PUBLIC_SIGNUP_ROLES.includes(role)) {
      return res.status(403).json({ error: 'HR and admin accounts can only be created by an existing admin.' });
    }

    try {
      // Check if user already exists
      const existingUser = await UserModel.findUserByEmail(email);
      if (existingUser) return res.status(409).json({ error: 'Email already exists' });

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = { username, email, password: hashedPassword, role };

      UserModel.registerUser(newUser, (err, result) => {
        if (err) {
          console.error('Error registering user:', err.message);
          return res.status(500).json({ error: 'Failed to register user' });
        }

        AuditLogModel.insertLog({
          userId: req.user?.id || result.insertId,
          actions: 'REGISTER_USER',
          descriptions: isAdmin
            ? `User ${email} (${role}) created by ${req.user.email}`
            : `User ${email} registered as ${role}`
        }, (logErr) => {
          if (logErr) console.error('Failed to insert audit log:', logErr.message);
        });

        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
      });

    } catch (err) {
      console.error('Error during registration:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

        // UPDATE an existing user role
  static async updateUserRole(req, res) {
    const userId = req.params.id;
    const role = (req.body.role || '').toString().trim().toLowerCase();

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
    }
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }
    try {
      if (await isProtectedUserId(userId)) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    UserModel.updateUserRole(userId, { role }, (err, result) => {
      if (err) {
        console.error('Error updating user role:', err);
        return res.status(500).json({ error: 'Failed to update user role' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'UPDATE_USER_ROLE',
        descriptions: `User ${userId} role set to ${role} by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr.message);
      });

      res.status(200).json({ message: 'User role updated successfully' });
    });
  }


  // Login user
  static async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
      const user = await UserModel.findUserByEmail(String(email));
      const passwordMatch = await bcrypt.compare(String(password), user ? user.password : DUMMY_HASH);
      if (!user || !passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

      // Deactivated accounts cannot sign in (checked after the password so it reveals nothing to guessers)
      if (!user.is_active) {
        return res.status(403).json({ error: 'This account has been deactivated. Please contact an administrator.', code: 'ACCOUNT_DEACTIVATED' });
      }

      const token = signToken(user);

      // Log the login action
      AuditLogModel.insertLog({
        userId: user.id,
        actions: 'LOGIN',
        descriptions: `User ${user.username} logged in`
      }, (err) => {
        if (err) console.error('Failed to log login action:', err);
      });

      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: user.id, username: user.username, email: user.email, role: user.role,
          mustChangePassword: Boolean(user.must_change_password)
        }
      });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  static async getAllUsers(req, res) {
    const query = `SELECT u.id, u.username, u.email, u.role, u.is_active, u.must_change_password, u.created_at,
        e.id AS employee_id, e.FullName AS employee_name
      FROM users u LEFT JOIN employees e ON e.user_id = u.id
      ORDER BY u.id`;
    db.query(query, (err, results) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(results);
    });
  }

  // Delete user (Admin only)
  static async deleteUser(req, res) {
    const userId = req.params.id;

    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    try {
      if (await isProtectedUserId(userId)) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    UserModel.deleteUser(userId, (err, result) => {
      if (err) {
        console.error('Error deleting user:', err);
        return res.status(500).json({ error: 'Failed to delete user' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Log the delete user action
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'DELETE_USER',
        descriptions: `User ${userId} deleted by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to log delete user action:', logErr);
      });

      res.status(200).json({ message: 'User deleted successfully' });
    });
  }

  // Get user profile
  static getProfile(req, res) {
    const userId = req.user.id; // From JWT middleware

    const query = `
      SELECT u.id, u.username, u.email, u.role, up.first_name, up.last_name, up.phone, up.address
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = ?
    `;

    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Error fetching profile:', err);
        return res.status(500).json({ error: 'Failed to fetch profile' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      res.status(200).json(results[0]);
    });
  }

  // Update user profile
  static updateProfile(req, res) {
    const userId = req.user.id; // From JWT middleware
    const { first_name, last_name, phone, address } = req.body;

    const profileData = { first_name, last_name, phone, address };

    UserProfileModel.upsertProfile(userId, profileData, (err, result) => {
      if (err) {
        console.error('Error updating profile:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      res.status(200).json({ message: 'Profile updated successfully' });
    });
  }

  // Current account (used by the frontend to refresh the stored user)
  static me(req, res) {
    res.json(req.user);
  }

  // The employee record linked to the signed-in account, if any
  static myEmployeeRecord(req, res) {
    db.query('SELECT * FROM employees WHERE user_id = ?', [req.user.id], (err, rows) => {
      if (err) {
        console.error('Error fetching own employee record:', err);
        return res.status(500).json({ error: 'Failed to fetch employee record' });
      }
      if (!rows.length) return res.status(404).json({ error: 'No employee record is linked to your account yet' });
      res.json(rows[0]);
    });
  }

  // Users HR/admin can link to an employee record (no passwords, no salary data)
  static linkableUsers(req, res) {
    const query = `SELECT u.id, u.username, u.email, u.role, e.id AS employee_id
      FROM users u LEFT JOIN employees e ON e.user_id = u.id
      ORDER BY u.username`;
    db.query(query, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(rows);
    });
  }

  // Sign out everywhere: every token issued so far stops working
  static logout(req, res) {
    UserModel.bumpTokenVersion(req.user.id, (err) => {
      if (err) {
        console.error('Error during logout:', err.message);
        return res.status(500).json({ error: 'Failed to sign out' });
      }
      audit(req.user.id, 'LOGOUT', `User ${req.user.email} signed out`);
      res.json({ message: 'Signed out' });
    });
  }

  // Change own password (also clears an admin-issued temporary password)
  static async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });
    if (String(currentPassword) === String(newPassword)) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    try {
      const user = await UserModel.findUserById(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(user.email)) return sendDemoProtected(res);
      const match = await bcrypt.compare(String(currentPassword), user.password);
      if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

      const hashed = await bcrypt.hash(String(newPassword), 10);
      UserModel.setPassword(user.id, hashed, false, (err) => {
        if (err) {
          console.error('Error changing password:', err.message);
          return res.status(500).json({ error: 'Failed to change password' });
        }
        audit(user.id, 'CHANGE_PASSWORD', `User ${user.email} changed their password`);
        // Other sessions are signed out; this one gets a fresh token
        const token = signToken({ ...user, token_version: user.token_version + 1 });
        res.json({
          message: 'Password changed successfully',
          token,
          user: { id: user.id, username: user.username, email: user.email, role: user.role, mustChangePassword: false }
        });
      });
    } catch (err) {
      console.error('Error changing password:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Activate / deactivate an account (Admin only)
  static async setUserStatus(req, res) {
    const userId = req.params.id;
    const { is_active } = req.body || {};
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be true or false' });
    }
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    try {
      if (await isProtectedUserId(userId)) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    UserModel.setActive(userId, is_active, (err, result) => {
      if (err) {
        console.error('Error updating user status:', err.message);
        return res.status(500).json({ error: 'Failed to update user status' });
      }
      if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
      audit(req.user.id, is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
        `User ${userId} ${is_active ? 'activated' : 'deactivated'} by ${req.user.email}`);
      res.json({ message: is_active ? 'User activated' : 'User deactivated' });
    });
  }

  // Admin sets a temporary password. The user must change it at next sign-in.
  // If no password is sent, a random one is generated and returned once.
  static async setTemporaryPassword(req, res) {
    const userId = req.params.id;
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ error: 'Use Change Password for your own account' });
    }
    const supplied = req.body && req.body.password;
    const tempPassword = supplied ? String(supplied) : `Tmp-${crypto.randomBytes(6).toString('base64url')}9`;
    const problem = passwordProblem(tempPassword);
    if (problem) return res.status(400).json({ error: problem });

    try {
      const user = await UserModel.findUserById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(user.email)) return sendDemoProtected(res);
      const hashed = await bcrypt.hash(tempPassword, 10);
      UserModel.setPassword(user.id, hashed, true, (err) => {
        if (err) {
          console.error('Error setting temporary password:', err.message);
          return res.status(500).json({ error: 'Failed to reset password' });
        }
        audit(req.user.id, 'RESET_PASSWORD', `Temporary password issued for user ${user.id} by ${req.user.email}`);
        res.json({
          message: 'Temporary password set. The user must change it at next sign-in.',
          ...(supplied ? {} : { temporaryPassword: tempPassword })
        });
      });
    } catch (err) {
      console.error('Error setting temporary password:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Admin generates a one-time reset link (no email is sent; the admin shares it)
  static async createResetLink(req, res) {
    const userId = req.params.id;
    try {
      const user = await UserModel.findUserById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(user.email)) return sendDemoProtected(res);
      if (!user.is_active) return res.status(400).json({ error: 'Activate the account before resetting its password' });
      PasswordResetModel.create(user.id, req.user.id, RESET_LINK_TTL_MINUTES, (err, data) => {
        if (err) {
          console.error('Error creating reset link:', err.message);
          return res.status(500).json({ error: 'Failed to create reset link' });
        }
        audit(req.user.id, 'RESET_LINK_CREATED', `Password reset link created for user ${user.id} by ${req.user.email}`);
        res.status(201).json({ token: data.token, expiresAt: data.expiresAt });
      });
    } catch (err) {
      console.error('Error creating reset link:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Public: set a new password with a one-time reset token
  static resetPasswordWithToken(req, res) {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });

    PasswordResetModel.findValid(token, async (err, row) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      if (!row || !row.is_active) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
      try {
        if (await isProtectedUserId(row.user_id)) return sendDemoProtected(res);
      } catch (guardErr) {
        return res.status(500).json({ error: 'Server error' });
      }
      PasswordResetModel.markUsed(row.id, async (useErr, used) => {
        if (useErr) return res.status(500).json({ error: 'Server error' });
        if (used.affectedRows === 0) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
        try {
          const hashed = await bcrypt.hash(String(newPassword), 10);
          UserModel.setPassword(row.user_id, hashed, false, (setErr) => {
            if (setErr) return res.status(500).json({ error: 'Failed to reset password' });
            audit(row.user_id, 'RESET_PASSWORD', `User ${row.user_id} reset their password with a reset link`);
            res.json({ message: 'Password has been reset. You can now sign in.' });
          });
        } catch (hashErr) {
          res.status(500).json({ error: 'Server error' });
        }
      });
    });
  }
}

module.exports = UserController;
