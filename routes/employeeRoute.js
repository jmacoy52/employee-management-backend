const express = require('express');
const router = express.Router();
const EmployeeController = require('../controllers/employeeController');
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

// Route to get all employees (Authenticated users)
router.get('/employees', authenticateToken, EmployeeController.getEmployees);

// Route to get a specific employee by ID (Authenticated users)
router.get('/employees/:id', authenticateToken, EmployeeController.getEmployeeById);

// Route to create an employee (HR only)
router.post('/employees', authenticateToken, authorizeHR, employeeValidation, handleValidation, EmployeeController.createEmployee);

// Route to update an employee (HR only)
router.put('/employees/:id', authenticateToken, authorizeHR, EmployeeController.updateEmployee);

// Route to delete an employee (HR only)
router.delete('/employees/:id', authenticateToken, authorizeHR, EmployeeController.deleteEmployee);

module.exports = router;
