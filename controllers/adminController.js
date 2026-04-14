const db = require('../config/db');
const UserModel = require('../models/userModel');
const AuditLogModel = require('../models/auditLogModel');
const AuditLogService = require('../services/auditLogService');
const NotificationModel = require('../models/notificationModel');
const AuthService = require('../services/authService');

class AdminController {
  static buildUsername({ username, email, firstName, lastName }) {
    if (username && username.trim()) {
      return username.trim();
    }

    const fullName = [firstName, lastName].filter(Boolean).join('.').trim();
    if (fullName) {
      return fullName.toLowerCase().replace(/\s+/g, '.');
    }

    return email.split('@')[0];
  }

  // Get all users
  static async getAllUsers(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    UserModel.getAllUsersPaginated(req.user.organization_id, limit, offset, (err, users) => {
      if (err) return res.status(500).json({ error: 'Server error' });

      UserModel.getTotalUserCount(req.user.organization_id, (countErr, total) => {
        if (countErr) return res.status(500).json({ error: 'Server error' });

        res.json({
          users,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalUsers: total,
            limit
          }
        });
      });
    });
  }

  // Get user by ID
  static getUserById(req, res) {
    const userId = req.params.id;
    UserModel.findUserById(userId, req.user.organization_id, (err, results) => {
      if (err) {
        console.error('Error fetching user:', err);
        return res.status(500).json({ error: 'Failed to fetch user' });
      }
      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Return user data without password
      const { password, ...userData } = results[0];
      res.json(userData);
    });
  }

  // Create new user (Admin)
  static async createUser(req, res) {
    try {
      const { username, email, role, firstName, lastName, department, position } = req.body;
      
      // Validate required fields
      if (!email || !role) {
        return res.status(400).json({ 
          error: 'Email and role are required' 
        });
      }

      if (role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          error: 'Only the Super Admin can create another Super Admin'
        });
      }

      const existingUser = await UserModel.findUserByEmail(email);

      if (existingUser) {
        return res.status(400).json({ 
          error: 'User with this email already exists' 
        });
      }

      const tempPassword = AuthService.generateTempPassword();
      const hashedPassword = await require('bcryptjs').hash(tempPassword, 12);
      const resolvedUsername = AdminController.buildUsername({ username, email, firstName, lastName });

      const userData = {
        organization_id: req.user.organization_id,
        username: resolvedUsername,
        email,
        password: hashedPassword,
        role,
        firstName: firstName || null,
        lastName: lastName || null,
        department: department || null,
        position: position || null,
        isTemporaryPassword: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      UserModel.createUser(userData, (err, result) => {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).json({ error: 'Failed to create user' });
        }

        AuditLogService.log('CREATE_USER', `Created new user: ${email} with role: ${role}`, {
          userId: req.user.id,
          entityId: result.insertId,
          afterValue: { username: resolvedUsername, email, role }
        }, req);

        res.status(201).json({
          success: true,
          message: 'User created successfully',
          user: {
            id: result.insertId,
            username: resolvedUsername,
            email,
            role,
            firstName,
            lastName,
            department,
            position,
            isTemporaryPassword: true
          },
          temporaryPassword: tempPassword
        });

        NotificationModel.createNotification({
          organization_id: req.user.organization_id,
          user_id: result.insertId,
          type: 'info',
          title: 'Account created',
          message: `Your ${role.replace('_', ' ')} account has been created. Use the temporary password shared by your Super Admin.`,
          icon: 'User',
          color: 'text-sky-500'
        }, () => {});

        NotificationModel.createSystemNotification({
          organization_id: req.user.organization_id,
          type: 'success',
          title: 'User provisioned',
          message: `${resolvedUsername} was added to the tenant as ${role.replace('_', ' ')}.`,
          icon: 'CheckCircle',
          color: 'text-emerald-500'
        }, () => {});
      });
    } catch (error) {
      console.error('Error in createUser:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Generate temporary password
  static generateTempPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // UPDATE an existing user role
  static updateUserRole(req, res) {
    const userId = req.params.id;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    UserModel.findUserById(userId, req.user.organization_id, (findErr, results) => {
      if (findErr) {
        console.error('Error fetching user for role update:', findErr);
        return res.status(500).json({ error: 'Failed to update user role' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      UserModel.updateUserRole(userId, req.user.organization_id, { role }, (err, result) => {
        if (err) {
          console.error('Error updating user role:', err);
          return res.status(500).json({ error: 'Failed to update user role' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        AuditLogService.log('ROLE_CHANGE', `User role changed to ${role} by ${req.user.email}`, {
          organizationId: req.user.organization_id,
          userId: req.user.id,
          entityId: userId,
          beforeValue: { role: results[0].role },
          afterValue: { role }
        }, req);

        res.status(200).json({ message: 'User role updated successfully' });
      });
    });
  }

  // Delete user
  static deleteUser(req, res) {
    const userId = req.params.id;

    UserModel.findUserById(userId, req.user.organization_id, (findErr, results) => {
      if (findErr) {
        console.error('Error fetching user:', findErr);
        return res.status(500).json({ error: 'Failed to delete user' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (results[0].role === 'super_admin') {
        return res.status(403).json({ error: 'Super Admin accounts cannot be deleted' });
      }

      const query = 'DELETE FROM users WHERE id = ? AND organization_id = ?';
      db.query(query, [userId, req.user.organization_id], (err, result) => {
        if (err) {
          console.error('Error deleting user:', err);
          return res.status(500).json({ error: 'Failed to delete user' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        AuditLogService.log('DELETE_USER', `User ${userId} deleted by ${req.user.email}`, {
          organizationId: req.user.organization_id,
          userId: req.user.id,
          entityId: parseInt(userId)
        }, req);

        res.status(200).json({ message: 'User deleted successfully' });
      });
    });
  }

  // Get all audit logs
  static getAllAuditLogs(req, res) {
    AuditLogModel.getAllLogs(req.user.organization_id, (err, logs) => {
      if (err) {
        console.error('Error fetching audit logs:', err);
        return res.status(500).json({ error: 'Failed to fetch audit logs' });
      }
      res.status(200).json(logs);
    });
  }

  // Get recent activities
  static getRecentActivities(req, res) {
    AuditLogModel.getRecentActivities(req.user.organization_id, (err, activities) => {
      if (err) {
        console.error('Error fetching recent activities:', err);
        return res.status(500).json({ error: 'Failed to fetch recent activities' });
      }
      res.status(200).json(activities);
    });
  }

  // Insert a log (for testing)
  static insertAuditLog(req, res) {
    const { userId, actions, descriptions } = req.body;

    if (!userId || !actions || !descriptions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    AuditLogModel.insertLog({
      organizationId: req.user.organization_id,
      userId,
      action: actions,
      description: descriptions
    }, (err, result) => {
      if (err) {
        console.error('Error inserting audit log:', err);
        return res.status(500).json({ error: 'Failed to insert audit log' });
      }
      res.status(201).json({ message: 'Audit log created successfully', logId: result.insertId });
    });
  }
}

module.exports = AdminController;
