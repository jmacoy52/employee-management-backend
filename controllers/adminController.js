const db = require('../config/db');
const UserModel = require('../models/userModel');
const AuditLogModel = require('../models/auditLogModel');
const AuditLogService = require('../services/auditLogService');

class AdminController {
  // Get all users
  static async getAllUsers(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    UserModel.getAllUsersPaginated(limit, offset, (err, users) => {
      if (err) return res.status(500).json({ error: 'Server error' });

      UserModel.getTotalUserCount((countErr, total) => {
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
    UserModel.findUserById(userId, (err, results) => {
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
      const { email, role, firstName, lastName, department, position } = req.body;
      
      // Validate required fields
      if (!email || !role) {
        return res.status(400).json({ 
          error: 'Email and role are required' 
        });
      }

      // Check if user already exists
      UserModel.findUserByEmail(email, async (err, existingUser) => {
        if (err) {
          console.error('Error checking existing user:', err);
          return res.status(500).json({ error: 'Server error' });
        }

        if (existingUser) {
          return res.status(400).json({ 
            error: 'User with this email already exists' 
          });
        }

        // Generate temporary password
        const tempPassword = this.generateTempPassword();
        const hashedPassword = await require('bcryptjs').hash(tempPassword, 12);

        // Create new user
        const userData = {
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

          // Log the action
          AuditLogService.log({
            userId: req.user.id,
            action: 'CREATE_USER',
            details: `Created new user: ${email} with role: ${role}`,
            ipAddress: req.ip
          });

          // Return user info with temporary password
          const { password, ...userWithoutPassword } = userData;
          res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: {
              id: result.insertId,
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
        });
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

    UserModel.updateUserRole(userId, { role }, (err, result) => {
      if (err) {
        console.error('Error updating user role:', err);
        return res.status(500).json({ error: 'Failed to update user role' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      AuditLogService.log('ROLE_CHANGE', `User role changed to ${role} by ${req.user.email}`, {
        userId: req.user.id,
        entityId: userId,
        beforeValue: { role: 'unknown' },
        afterValue: { role }
      }, req);

      res.status(200).json({ message: 'User role updated successfully' });
    });
  }

  // Delete user
  static deleteUser(req, res) {
    const userId = req.params.id;

    UserModel.deleteUser(userId, (err, result) => {
      if (err) {
        console.error('Error deleting user:', err);
        return res.status(500).json({ error: 'Failed to delete user' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      AuditLogService.log('DELETE_USER', `User ${userId} deleted by ${req.user.email}`, {
        userId: req.user.id,
        entityId: parseInt(userId)
      }, req);

      res.status(200).json({ message: 'User deleted successfully' });
    });
  }

  // Get all audit logs
  static getAllAuditLogs(req, res) {
    AuditLogModel.getAllLogs((err, logs) => {
      if (err) {
        console.error('Error fetching audit logs:', err);
        return res.status(500).json({ error: 'Failed to fetch audit logs' });
      }
      res.status(200).json(logs);
    });
  }

  // Get recent activities
  static getRecentActivities(req, res) {
    AuditLogModel.getRecentActivities((err, activities) => {
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

    AuditLogModel.insertLog({ userId, actions, descriptions }, (err, result) => {
      if (err) {
        console.error('Error inserting audit log:', err);
        return res.status(500).json({ error: 'Failed to insert audit log' });
      }
      res.status(201).json({ message: 'Audit log created successfully', logId: result.insertId });
    });
  }
}

module.exports = AdminController;