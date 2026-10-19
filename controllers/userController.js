const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const UserProfileModel = require('../models/userProfileModel');
const db = require('../config/db');

const crypto = require('crypto');
const AuditLogModel = require('../models/auditLogModel');
const PasswordResetModel = require('../models/passwordResetModel');
const { ROLES, DEFAULT_ROLE, OWNER_ROLE, passwordProblem, ownerPasswordProblem } = require('../config/roles');
const { isProtectedEmail, isProtectedUserId, sendDemoProtected } = require('../config/demoAccounts');
const OrganizationModel = require('../models/organizationModel');
const { organisationBlock } = require('../middleware/authMiddleware');
const { ANY_ORG } = UserModel;

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

// organizationId: the organisation the event belongs to (defaults to the acting user's own)
function audit(userId, actions, descriptions, organizationId) {
  const entry = { userId, actions, descriptions };
  if (organizationId !== undefined) entry.organizationId = organizationId;
  AuditLogModel.insertLog(entry, (logErr) => {
    if (logErr) console.error(`Failed to log ${actions}:`, logErr.message);
  });
}

// Which accounts the signed-in user may manage. Org admins: their own organisation. The platform
// owner (only reaches these handlers through /api/platform/*): any organisation's accounts,
// never another owner. Both come from the database-loaded account, never from the request.
function scopeOf(req) {
  return req.user.role === 'owner' ? ANY_ORG : req.user.organizationId;
}

// The user object returned to the frontend after login / password change
function publicUser(user, organization) {
  return {
    id: user.id, username: user.username, email: user.email, role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
    organization: organization || null,
  };
}

// Login lookup: the account plus its organisation's status
function findLoginAccount(email) {
  return new Promise((resolve, reject) => {
    db.query(
      `SELECT u.*, o.name AS organization_name, o.slug AS organization_slug, o.status AS organization_status, o.rejection_reason AS organization_rejection_reason
       FROM users u LEFT JOIN organizations o ON o.id = u.organization_id WHERE u.email = ?`,
      [email],
      (err, rows) => (err ? reject(err) : resolve(rows[0] || null))
    );
  });
}

class UserController {
  // There is no anonymous self-sign-up: an employee cannot join an organisation on their own.
  // Accounts are created inside the signed-in admin's (or HR's) organisation. New organisations
  // sign up through POST /api/organizations/register instead.
  static requireAccountCreator(req, res, next) {
    if (!req.user || !['admin', 'hr'].includes(req.user.role)) {
      return res.status(403).json({
        error: "Accounts are created by your organisation's admin or HR team. Ask them for an account, or register your organisation.",
        code: 'SELF_SIGNUP_CLOSED',
      });
    }
    next();
  }

  // Register new user (admin: any organisation role; HR: employee accounts), in the creator's
  // organisation. The organisation's seat limit (active accounts) is enforced.
  static async register(req, res) {
    const { username, email, password } = req.body;
    const role = (req.body.role || DEFAULT_ROLE).toString().trim().toLowerCase();
    const isAdmin = req.user.role === 'admin';

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
    if (!isAdmin && role !== 'employee') {
      return res.status(403).json({ error: 'HR and admin accounts can only be created by an existing admin.' });
    }

    try {
      // Check if user already exists (e-mail addresses are unique across the platform: they are the login)
      const existingUser = await UserModel.findUserByEmail(email);
      if (existingUser) return res.status(409).json({ error: 'Email already exists' });

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUserId = await OrganizationModel.insertUser(req.user.organizationId, { username, email, password: hashedPassword, role });

      AuditLogModel.insertLog({
        userId: req.user.id,
        organizationId: req.user.organizationId,
        actions: 'REGISTER_USER',
        descriptions: `User ${email} (${role}) created by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr.message);
      });

      res.status(201).json({ message: 'User registered successfully', userId: newUserId });

    } catch (err) {
      if (err.code === 'SEAT_LIMIT_REACHED') return res.status(409).json({ error: err.message, code: err.code });
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
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
      // Accounts of other organisations do not exist as far as this admin is concerned (404)
      const target = await UserModel.findUserInScope(userId, scopeOf(req));
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(target.email)) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    UserModel.updateUserRole(userId, scopeOf(req), { role }, (err, result) => {
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
      const user = await findLoginAccount(String(email));
      const passwordMatch = await bcrypt.compare(String(password), user ? user.password : DUMMY_HASH);
      if (!user || !passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

      // Deactivated accounts cannot sign in (checked after the password so it reveals nothing to guessers)
      if (!user.is_active) {
        return res.status(403).json({ error: 'This account has been deactivated. Please contact an administrator.', code: 'ACCOUNT_DEACTIVATED' });
      }

      // Organisation not approved yet, or suspended: a clear message, no token
      const blocked = organisationBlock(user);
      if (blocked) return res.status(403).json(blocked);

      const token = signToken(user);

      // Log the login action
      AuditLogModel.insertLog({
        userId: user.id,
        actions: 'LOGIN',
        descriptions: `User ${user.username} logged in`
      }, (err) => {
        if (err) console.error('Failed to log login action:', err);
      });

      // Last successful sign-in (shown to the platform owner for organisation admins)
      db.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id], (err) => {
        if (err) console.error('Failed to record the last sign-in:', err.message);
      });

      res.status(200).json({
        message: 'Login successful',
        token,
        user: publicUser(user, user.organization_id
          ? { id: user.organization_id, name: user.organization_name, slug: user.organization_slug }
          : null)
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
      WHERE u.organization_id = ?
      ORDER BY u.id`;
    db.query(query, [req.user.organizationId], (err, results) => {
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
      const target = await UserModel.findUserInScope(userId, scopeOf(req));
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(target.email)) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    UserModel.deleteUser(userId, scopeOf(req), (err, result) => {
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
    db.query('SELECT * FROM employees WHERE user_id = ? AND organization_id = ?', [req.user.id, req.user.organizationId], (err, rows) => {
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
      WHERE u.organization_id = ?
      ORDER BY u.username`;
    db.query(query, [req.user.organizationId], (err, rows) => {
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
    // The platform owner's password follows the stricter owner rules
    const problem = req.user.role === OWNER_ROLE ? ownerPasswordProblem(newPassword, req.user.email) : passwordProblem(newPassword);
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
          user: { ...publicUser({ ...user, must_change_password: 0 }, req.user.organization) }
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
    let target;
    try {
      target = await UserModel.findUserInScope(userId, scopeOf(req));
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(target.email)) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    const done = (result) => {
      if (!result) return res.status(404).json({ error: 'User not found' });
      audit(req.user.id, is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
        `User ${target.email} (${target.id}) ${is_active ? 'activated' : 'deactivated'} by ${req.user.email}`, target.organization_id);
      res.json({ message: is_active ? 'User activated' : 'User deactivated' });
    };
    if (is_active) {
      // Reactivation takes a seat: the organisation's seat limit applies
      try {
        return done(await OrganizationModel.activateUser(target.organization_id, target.id));
      } catch (err) {
        if (err.code === 'SEAT_LIMIT_REACHED') return res.status(409).json({ error: err.message, code: err.code });
        console.error('Error updating user status:', err.message);
        return res.status(500).json({ error: 'Failed to update user status' });
      }
    }
    UserModel.setActive(target.id, scopeOf(req), false, (err, result) => {
      if (err) {
        console.error('Error updating user status:', err.message);
        return res.status(500).json({ error: 'Failed to update user status' });
      }
      done(result.affectedRows);
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
      const user = await UserModel.findUserInScope(userId, scopeOf(req));
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(user.email)) return sendDemoProtected(res);
      const hashed = await bcrypt.hash(tempPassword, 10);
      UserModel.setPassword(user.id, hashed, true, (err) => {
        if (err) {
          console.error('Error setting temporary password:', err.message);
          return res.status(500).json({ error: 'Failed to reset password' });
        }
        audit(req.user.id, 'RESET_PASSWORD', `Temporary password issued for user ${user.email} (${user.id}) by ${req.user.email}`, user.organization_id);
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
      const user = await UserModel.findUserInScope(userId, scopeOf(req));
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (isProtectedEmail(user.email)) return sendDemoProtected(res);
      if (!user.is_active) return res.status(400).json({ error: 'Activate the account before resetting its password' });
      PasswordResetModel.create(user.id, req.user.id, RESET_LINK_TTL_MINUTES, (err, data) => {
        if (err) {
          console.error('Error creating reset link:', err.message);
          return res.status(500).json({ error: 'Failed to create reset link' });
        }
        audit(req.user.id, 'RESET_LINK_CREATED', `Password reset link created for user ${user.email} (${user.id}) by ${req.user.email}`, user.organization_id);
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
module.exports.signToken = signToken;
