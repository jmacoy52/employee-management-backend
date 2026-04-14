const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const UserProfileModel = require('../models/userProfileModel');
const db = require('../config/db');
const AuditLogService = require('../services/auditLogService');

const JWT_SECRET = process.env.JWT_SECRET;

class UserController {
  // Register new user
  static async register(req, res) {
    const { username, email, password, role } = req.body;

    // Ensure only username, email, password, role are in the payload
    const allowedFields = ['username', 'email', 'password', 'role'];
    if (Object.keys(req.body).length !== allowedFields.length || !allowedFields.every(key => req.body.hasOwnProperty(key))) {
      return res.status(400).json({ error: 'Invalid payload. Only username, email, password, and role are allowed.' });
    }

    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    try {
      // Check if user already exists
      const existingUser = await UserModel.findUserByEmail(email);
      if (existingUser) return res.status(409).json({ error: 'Email already exists' });

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = { username, email, password: hashedPassword, role };

      UserModel.registerUser(newUser, (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to register user' });

        AuditLogService.log('USER_REGISTER', `New user registered: ${username} with role ${role}`, {
          entityId: result.insertId,
          afterValue: { username, email, role }
        }, req);

        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
      });

    } catch (err) {
      console.error('Error during registration:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // Get user profile
  static getProfile(req, res) {
    const userId = req.user.id;
    const organizationId = req.user.organization_id;

    UserModel.getProfile(userId, organizationId, (err, results) => {
      if (err) {
        console.error('Error fetching user profile:', err);
        return res.status(500).json({ error: 'Failed to fetch profile' });
      }

      if (!results || results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Return user data without password
      const profile = results[0];
      console.log('Profile data:', profile); // Debug log
      res.json(profile);
    });
  }

  // Update user profile
  static updateProfile(req, res) {
    const userId = req.user.id;
    const organizationId = req.user.organization_id;
    const updates = req.body;

    // Prevent updating sensitive fields
    delete updates.role;
    delete updates.password;

    UserModel.updateUserProfile(userId, organizationId, updates, (err, result) => {
      if (err) {
        console.error('Error updating user profile:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      AuditLogService.log('UPDATE_PROFILE', `User profile updated by ${req.user.email}`, {
        userId: req.user.id,
        beforeValue: {},
        afterValue: updates
      }, req);

      res.json({ message: 'Profile updated successfully' });
    });
  }

  // Change password
  static async changePassword(req, res) {
    console.log('Password change request received:', req.method, req.url);
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    try {
      // Get user using async method
      const user = await UserModel.findUserByIdAsync(userId, req.user.organization_id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        AuditLogService.log('PASSWORD_CHANGE_FAILED', `Incorrect current password for ${req.user.email}`, { userId }, req);
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      // Update password using Promise wrapper
      const updateResult = await new Promise((resolve, reject) => {
        UserModel.updateUserProfile(userId, req.user.organization_id, { password: hashedNewPassword }, (err, result) => {
          if (err) {
            return reject(err);
          }
          resolve(result);
        });
      });

      if (updateResult.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      AuditLogService.log('PASSWORD_CHANGE', `Password changed by ${req.user.email}`, { userId }, req);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Upload profile picture
  static async uploadProfilePicture(req, res) {
    try {
      console.log('Profile picture upload request received');
      console.log('User ID:', req.user?.id);
      console.log('File:', req.file);
      
      const userId = req.user.id;
      
      if (!req.file) {
        console.log('No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const profilePictureUrl = `/uploads/${req.file.filename}`;
      console.log('Profile picture URL:', profilePictureUrl);
      console.log('Original file size:', req.file.size, 'bytes');
      
      // Update user profile picture in database
      const updateResult = await new Promise((resolve, reject) => {
        UserModel.updateUserProfile(userId, req.user.organization_id, { profile_picture: profilePictureUrl }, (err, result) => {
          if (err) {
            console.error('Database update error:', err);
            return reject(err);
          }
          resolve(result);
        });
      });

      if (updateResult.affectedRows === 0) {
        console.log('User not found');
        return res.status(404).json({ error: 'User not found' });
      }

      console.log('Profile picture updated successfully');
      res.status(200).json({ 
        message: 'Profile picture uploaded successfully',
        profilePictureUrl: profilePictureUrl
      });
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({ error: 'Failed to upload profile picture' });
    }
  }

  // Get all users (Admin only)
  static async getAllUsers(req, res) {
    try {
      const query = `
        SELECT id, username, email, role, created_at
        FROM users 
        WHERE organization_id = ?
        ORDER BY created_at DESC
      `;
      
      db.query(query, [req.user.organization_id], (err, results) => {
        if (err) {
          console.error('Error fetching users:', err);
          return res.status(500).json({ error: 'Failed to fetch users' });
        }
        
        console.log('Users fetched successfully:', results.length, 'users');
        res.json(results);
      });
    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Get user statistics (Admin only)
  static async getUserStats(req, res) {
    try {
      const query = `
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as adminUsers,
          SUM(CASE WHEN role = 'hr' THEN 1 ELSE 0 END) as hrUsers,
          SUM(CASE WHEN role = 'employee' THEN 1 ELSE 0 END) as employeeUsers,
          SUM(CASE WHEN role = 'super_admin' THEN 1 ELSE 0 END) as superAdminUsers
        FROM users
        WHERE organization_id = ?
      `;
      
      db.query(query, [req.user.organization_id], (err, results) => {
        if (err) {
          console.error('Error fetching user stats:', err);
          return res.status(500).json({ error: 'Failed to fetch user statistics' });
        }
        
        const stats = results[0];
        res.json({
          totalUsers: parseInt(stats.totalUsers),
          adminUsers: parseInt(stats.adminUsers),
          hrUsers: parseInt(stats.hrUsers),
          employeeUsers: parseInt(stats.employeeUsers),
          superAdminUsers: parseInt(stats.superAdminUsers)
        });
      });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Delete user (Admin only)
  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id; // Admin performing the action
      
      // Don't allow admins to delete themselves
      if (parseInt(id) === parseInt(userId)) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      
      // Don't allow deletion of super admins except by other super admins
      const userQuery = 'SELECT role FROM users WHERE id = ? AND organization_id = ?';
      db.query(userQuery, [id, req.user.organization_id], (err, results) => {
        if (err) {
          console.error('Error checking user role:', err);
          return res.status(500).json({ error: 'Failed to check user' });
        }
        
        if (results.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        const targetUser = results[0];
        if (targetUser.role === 'super_admin' && req.user.role !== 'super_admin') {
          return res.status(403).json({ error: 'Cannot delete Super Admin accounts' });
        }
        
        // Proceed with deletion
        const deleteQuery = 'DELETE FROM users WHERE id = ? AND organization_id = ?';
        db.query(deleteQuery, [id, req.user.organization_id], (err, result) => {
          if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: 'Failed to delete user' });
          }
          
          AuditLogService.log('USER_DELETE', `User deleted: ${id}`, {
            entityId: id,
            beforeValue: targetUser,
            afterValue: null
          }, req);
          
          res.json({ message: 'User deleted successfully' });
        });
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // Batch delete users (Admin only)
  static async batchDeleteUsers(req, res) {
    try {
      const { userIds } = req.body;
      const adminId = req.user.id;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'No user IDs provided' });
      }
      
      // Don't allow admins to delete themselves in batch
      const filteredIds = userIds.filter(id => parseInt(id) !== parseInt(adminId));
      
      if (filteredIds.length === 0) {
        return res.status(400).json({ error: 'No valid users to delete' });
      }
      
      // Check for super admin users in the list
      const placeholders = userIds.map(() => '?').join(',');
      const checkQuery = `
        SELECT id, role FROM users 
        WHERE id IN (${placeholders}) AND role = 'super_admin' AND organization_id = ?
      `;
      
      db.query(checkQuery, [...userIds, req.user.organization_id], (err, results) => {
        if (err) {
          console.error('Error checking super admin users:', err);
          return res.status(500).json({ error: 'Failed to check users' });
        }
        
        if (results.length > 0 && req.user.role !== 'super_admin') {
          return res.status(403).json({ 
            error: 'Cannot delete Super Admin accounts',
            superAdminUsers: results.map(user => user.id)
          });
        }
        
        // Proceed with batch deletion
        const deletePlaceholders = filteredIds.map(() => '?').join(',');
        const deleteQuery = `
          DELETE FROM users 
          WHERE id IN (${deletePlaceholders}) AND organization_id = ?
        `;
        
        db.query(deleteQuery, [...filteredIds, req.user.organization_id], (err, result) => {
          if (err) {
            console.error('Error batch deleting users:', err);
            return res.status(500).json({ error: 'Failed to delete users' });
          }
          
          AuditLogService.log('USER_BATCH_DELETE', `Batch deleted ${filteredIds.length} users`, {
            entityId: filteredIds,
            beforeValue: filteredIds,
            afterValue: null
          }, req);
          
          res.json({ 
            message: `${filteredIds.length} users deleted successfully`,
            deletedCount: filteredIds.length
          });
        });
      });
    } catch (error) {
      console.error('Batch delete users error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = UserController;
