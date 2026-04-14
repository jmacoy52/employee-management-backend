const Employee = require('../models/employeeModel');
const AuditLogModel = require('../models/auditLogModel');

class EmployeeController {
  // Get all employees
  static getEmployees(req, res) {
    Employee.getAllEmployees(req.user.organization_id, (err, data) => {
      if (err) {
        console.error('Error fetching employees:', err);
        return res.status(500).json({ error: 'Failed to fetch employees' });
      }

      res.status(200).json(data);
    });
  }

  // Create a new employee
  static createEmployee(req, res) {
    const { FullName, position, Department, salary, email } = req.body;

    if (!FullName || !position || !Department || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const newEmployee = { organization_id: req.user.organization_id, FullName, position, Department, salary, email };
    Employee.insertEmployee(newEmployee, (err, result) => {
      if (err) {
        console.error('Error inserting employee:', err);
        return res.status(500).json({ error: 'Failed to insert employee' });
      }

      // Log this action
      AuditLogModel.insertLog({
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'CREATE_EMPLOYEE',
        description: `Employee ${FullName} created by ${req.user.email}`
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

    const updatedData = { organization_id: req.user.organization_id, FullName, position, Department, salary };

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
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'UPDATE_EMPLOYEE',
        description: `Employee ${employeeId} updated by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(200).json({ message: 'Employee updated successfully' });
    });
  }

  // Delete employee
  static deleteEmployee(req, res) {
    const employeeId = req.params.id;

    Employee.deleteEmployee(employeeId, req.user.organization_id, (err, result) => {
      if (err) {
        console.error('Error deleting employee:', err);
        return res.status(500).json({ error: 'Failed to delete employee' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Log this action
      AuditLogModel.insertLog({
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'DELETE_EMPLOYEE',
        description: `Employee ${employeeId} deleted by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(200).json({ message: 'Employee deleted successfully' });
    });
  }

  // Get employee by Id
  static getEmployeeById(req, res) {
    const employeeId = req.params.id;

    Employee.getEmployeeById(employeeId, req.user.organization_id, (err, employee) => {
      if (err) {
        console.error('Error fetching employee:', err);
        return res.status(500).json({ error: 'Failed to fetch employee' });
      }

      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      res.status(200).json(employee);
    });
  }
}

module.exports = EmployeeController;



