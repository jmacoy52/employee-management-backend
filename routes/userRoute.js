const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const LoginController = require('../controllers/auth/loginController');
const ForgotPasswordController = require('../controllers/auth/forgotPasswordController');
const { authenticateToken, authorizeAdmin } = require('../middleware/authMiddleware');
const { validationResult } = require('express-validator');
const multer = require('multer');

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(file.originalname.split('.').pop().toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

// Middleware to handle validation errors
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Validators
const registerValidator = require('../validator/registerValidator');
const loginValidator = require('../validator/loginValidator');
const { checkSchema } = require('express-validator');
const roleValidationSchema = require('../validator/roleValidator');
const roleValidator = checkSchema(roleValidationSchema);

// Register (Public)
router.post('/register', registerValidator, handleValidation, UserController.register);

// Login (Public)
router.post('/login', loginValidator, handleValidation, LoginController.login);

// Forgot password (Public)
router.post('/forgot-password', ForgotPasswordController.forgotPassword);

// Reset password (Public)
router.post('/reset-password',authenticateToken, ForgotPasswordController.resetPassword);

// Change password (Authenticated)
router.put('/change-password', authenticateToken, UserController.changePassword);

// Profile routes (Authenticated)
router.get('/profile', authenticateToken, UserController.getProfile);
router.put('/profile', authenticateToken, UserController.updateProfile);

// Profile picture upload (Authenticated)
router.post('/profile-picture', authenticateToken, upload.single('profilePicture'), UserController.uploadProfilePicture);

// Get all users (Admin only)
router.get('/all', authenticateToken, authorizeAdmin, UserController.getAllUsers);

// Get user statistics (Admin only)
router.get('/stats', authenticateToken, authorizeAdmin, UserController.getUserStats);

// Delete user (Admin only)
router.delete('/:id', authenticateToken, authorizeAdmin, UserController.deleteUser);

// Batch delete users (Admin only)
router.delete('/batch-delete', authenticateToken, authorizeAdmin, UserController.batchDeleteUsers);

module.exports = router;
