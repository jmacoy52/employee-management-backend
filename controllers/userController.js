const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const UserProfileModel = require('../models/userProfileModel');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;

class UserController {
  // Register new user
  static async register(req, res) {
    const { username, email, password, role } = req.body;

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
        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
      });

    } catch (err) {
      console.error('Error during registration:', err);
      return res.status(500).json({ error: 'Server error' });
    }
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

      res.status(200).json({ message: 'User role updated successfully' });
    });
  }


  // Login user
  static async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
      const user = await UserModel.findUserByEmail(email);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);

      // Log the login action
      const AuditLogModel = require('../models/auditLogModel');
      AuditLogModel.insertLog({
        userId: user.id,
        actions: 'LOGIN',
        descriptions: `User ${user.username} logged in`
      }, (err) => {
        if (err) console.error('Failed to log login action:', err);
      });

      res.status(200).json({ message: 'Login successful', token });

    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  static async getAllUsers(req, res) {
    db.query('SELECT id, username, email, role, created_at FROM users', (err, results) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(results);
    });
  }

  // Delete user (Admin only)
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

      // Log the delete user action
      const AuditLogModel = require('../models/auditLogModel');
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
      SELECT u.username, u.email, u.role, up.first_name, up.last_name, up.phone, up.address
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
}

module.exports = UserController;
