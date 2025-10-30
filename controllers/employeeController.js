const Employee = require('../models/employeeModel');
const AuditLogModel = require('../models/auditLogModel');

class EmployeeController {
  // Get all employees
  static getEmployees(req, res) {
    Employee.getAllEmployees((err, data) => {
      if (err) {
        console.error('Error fetching employees:', err);
        return res.status(500).json({ error: 'Failed to fetch employees' });
      }

      // Log this action
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'VIEW_EMPLOYEES',
        descriptions: `User ${req.user.email} viewed all employees`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(200).json(data);
    });
  }

  // Create a new employee
  static createEmployee(req, res) {
    const { FullName, position, Department, salary, email } = req.body;

    if (!FullName || !position || !Department || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const newEmployee = { FullName, position, Department, salary, email };
    Employee.insertEmployee(newEmployee, (err, result) => {
      if (err) {
        console.error('Error inserting employee:', err);
        return res.status(500).json({ error: 'Failed to insert employee' });
      }

      // Log this action
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'CREATE_EMPLOYEE',
        descriptions: `Employee ${FullName} created by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(201).json({ message: 'Employee created successfully', id: result.insertId });
    });
  }

  // UPDATE an existing employee
  static updateEmployee(req, res) {
    const employeeId = req.params.id;
    const { FullName, position, Department, salary } = req.body;

    if (!FullName || !position || !Department || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const updatedData = { FullName, position, Department, salary };

    Employee.updateEmployee(employeeId, updatedData, (err, result) => {
      if (err) {
        console.error('Error updating employee:', err);
        return res.status(500).json({ error: 'Failed to update employee' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Log this action
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'UPDATE_EMPLOYEE',
        descriptions: `Employee ${employeeId} updated by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(200).json({ message: 'Employee updated successfully' });
    });
  }

  // Delete employee
  static deleteEmployee(req, res) {
    const employeeId = req.params.id;

    Employee.deleteEmployee(employeeId, (err, result) => {
      if (err) {
        console.error('Error deleting employee:', err);
        return res.status(500).json({ error: 'Failed to delete employee' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Log this action
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'DELETE_EMPLOYEE',
        descriptions: `Employee ${employeeId} deleted by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(200).json({ message: 'Employee deleted successfully' });
    });
  }

  // Get employee by Id
  static getEmployeeById(req, res) {
    const employeeId = req.params.id;

    Employee.getEmployeeById(employeeId, (err, employee) => {
      if (err) {
        console.error('Error fetching employee:', err);
        return res.status(500).json({ error: 'Failed to fetch employee' });
      }

      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Log this action
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'VIEW_EMPLOYEE',
        descriptions: `User ${req.user.email} viewed employee ${employeeId}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(200).json(employee);
    });
  }
}

module.exports = EmployeeController;



