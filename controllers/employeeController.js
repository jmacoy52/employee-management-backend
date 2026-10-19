const Employee = require('../models/employeeModel');
const AuditLogModel = require('../models/auditLogModel');
const UserModel = require('../models/userModel');
const { pagination } = require('../config/pagination');
const { isProtectedEmail, employeeProtection, sendDemoProtected } = require('../config/demoAccounts');

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
    }, pagination(req.query));
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
  static async deleteEmployee(req, res) {
    const employeeId = req.params.id;

    // The demo employee's record backs a public demo login
    try {
      if ((await employeeProtection(employeeId)).protected) return sendDemoProtected(res);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

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

  // Link a user account to this employee record, or unlink with user_id = null
  static async linkUser(req, res) {
    const employeeId = req.params.id;
    const raw = req.body ? req.body.user_id : undefined;
    if (raw === undefined) return res.status(400).json({ error: 'user_id is required (a user id, or null to unlink)' });
    const userId = raw === null || raw === '' ? null : Number(raw);
    if (userId !== null && !Number.isInteger(userId)) return res.status(400).json({ error: 'user_id must be a number or null' });

    try {
      const user = userId !== null ? await UserModel.findUserById(userId) : null;
      if (userId !== null && !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Demo accounts: the only allowed change is (re)linking a demo record to its own demo account
      const record = await employeeProtection(employeeId);
      if (record.protected || (user && isProtectedEmail(user.email))) {
        const restoresOwnLink = user && record.email && user.email.toLowerCase() === String(record.email).toLowerCase();
        if (!restoresOwnLink) return sendDemoProtected(res);
      }
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    Employee.setUser(employeeId, userId, (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That account is already linked to another employee' });
        console.error('Error linking employee:', err);
        return res.status(500).json({ error: 'Failed to link account' });
      }
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Employee not found' });
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: userId ? 'LINK_EMPLOYEE_USER' : 'UNLINK_EMPLOYEE_USER',
        descriptions: userId
          ? `Employee ${employeeId} linked to user ${userId} by ${req.user.email}`
          : `Employee ${employeeId} unlinked by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });
      res.json({ message: userId ? 'Account linked' : 'Account unlinked' });
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



