const express = require('express');
const router = express.Router();
const DepartmentController = require('../controllers/departmentController');
const { authenticateToken, authorizeHR } = require('../middleware/authMiddleware');

// Departments are managed by HR (primary owner) and admins
router.use(authenticateToken, authorizeHR);

// List with employee counts / one department with its members
router.get('/', DepartmentController.list);
router.get('/:id', DepartmentController.get);

// Create, edit (name, description), activate/deactivate, delete (only when empty)
router.post('/', DepartmentController.create);
router.put('/:id', DepartmentController.update);
router.put('/:id/status', DepartmentController.setStatus);
router.delete('/:id', DepartmentController.remove);

// Members and head of department
router.post('/:id/employees', DepartmentController.assign);
router.delete('/:id/employees/:employeeId', DepartmentController.unassign);
router.put('/:id/head', DepartmentController.setHead);

module.exports = router;
