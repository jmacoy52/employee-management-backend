const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { authenticateToken, authorizeAdmin } = require('../middleware/authMiddleware');
const { checkSchema } = require('express-validator');
const roleValidationSchema = require('../validator/roleValidator');
const roleValidator = checkSchema(roleValidationSchema);
const { validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all users (Admin)
router.get('/users', authenticateToken, authorizeAdmin, AdminController.getAllUsers);

// Get user by ID (Admin)
router.get('/users/:id', authenticateToken, authorizeAdmin, AdminController.getUserById);

// Create new user (Admin)
router.post('/users', authenticateToken, authorizeAdmin, AdminController.createUser);

// Update user role (Admin)
router.put('/users/:id/role', authenticateToken, authorizeAdmin, roleValidator, handleValidation, AdminController.updateUserRole);

// Delete user (Admin)
router.delete('/users/:id', authenticateToken, authorizeAdmin, AdminController.deleteUser);

// Route to get all audit logs (Admin)
router.get('/audit-logs', authenticateToken, authorizeAdmin, AdminController.getAllAuditLogs);

// Route to get recent activities (Admin)
router.get('/audit-logs/recent', authenticateToken, authorizeAdmin, AdminController.getRecentActivities);

// Route to insert audit log (Admin, for testing)
router.post('/audit-logs', authenticateToken, authorizeAdmin, AdminController.insertAuditLog);

module.exports = router;
