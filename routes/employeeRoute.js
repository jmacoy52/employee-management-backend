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

// Route to get all employees (HR/Admin; employee records include salaries)
router.get('/employees', authenticateToken, authorizeHR, EmployeeController.getEmployees);

// Route to get a specific employee by ID (HR/Admin)
router.get('/employees/:id', authenticateToken, authorizeHR, EmployeeController.getEmployeeById);

// Route to create an employee (HR/Admin)
router.post('/employees', authenticateToken, authorizeHR, employeeValidation, handleValidation, EmployeeController.createEmployee);

// Route to update an employee (HR/Admin)
router.put('/employees/:id', authenticateToken, authorizeHR, employeeValidation.update, handleValidation, EmployeeController.updateEmployee);

// Route to link/unlink a user account to an employee record (HR/Admin). Body: { user_id: number | null }
router.put('/employees/:id/link', authenticateToken, authorizeHR, EmployeeController.linkUser);

// Route to delete an employee (HR/Admin)
router.delete('/employees/:id', authenticateToken, authorizeHR, EmployeeController.deleteEmployee);

module.exports = router;
