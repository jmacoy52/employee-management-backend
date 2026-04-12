const express = require('express');
const router = express.Router();
const HrController = require('../controllers/hrController');
const { authenticateToken, authorizeHR } = require('../middleware/authMiddleware');
const employeeValidation = require('../validator/employeeValidator');
const { validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Route to get all employees (HR/Admin)
router.get('/employees', authenticateToken, authorizeHR, HrController.getEmployees);

// Route to get a specific employee by ID (HR/Admin)
router.get('/employees/:id', authenticateToken, authorizeHR, HrController.getEmployeeById);

// Route to create an employee (HR/Admin)
router.post('/employees', authenticateToken, authorizeHR, employeeValidation, handleValidation, HrController.createEmployee);

// Route to update an employee (HR/Admin)
router.put('/employees/:id', authenticateToken, authorizeHR, HrController.updateEmployee);

// Route to delete an employee (HR/Admin)
router.delete('/employees/:id', authenticateToken, authorizeHR, HrController.deleteEmployee);

module.exports = router;