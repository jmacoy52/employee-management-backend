const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticateToken, authorizeAdmin } = require('../middleware/authMiddleware');
const userValidation = require('../validator/userValidator');
const { validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Route to register a user (Public)
router.post('/register', userValidation, handleValidation, UserController.register);

// Route to login a user (Public)
router.post('/login', UserController.login);

// Route to get all users (Admin only)
router.get('/all', authenticateToken, authorizeAdmin, UserController.getAllUsers);

// Route to update user role (Admin only)
router.put('/:id/role', authenticateToken, authorizeAdmin, UserController.updateUserRole);

// Route to delete a user (Admin only)
router.delete('/:id', authenticateToken, authorizeAdmin, UserController.deleteUser);

// Route to get user profile (Authenticated users)
router.get('/profile', authenticateToken, UserController.getProfile);

// Route to update user profile (Authenticated users)
router.put('/profile', authenticateToken, UserController.updateProfile);

module.exports = router;
