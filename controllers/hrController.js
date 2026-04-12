const Employee = require('../models/employeeModel');
const AuditLogModel = require('../models/auditLogModel');

class HrController {
  // Get all employees
  static getEmployees(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    Employee.getAllEmployeesPaginated(limit, offset, (err, data) => {
      if (err) {
        console.error('Error fetching employees:', err);
        return res.status(500).json({ error: 'Failed to fetch employees' });
      }

      Employee.getTotalCount((countErr, total) => {
        if (countErr) {
          console.error('Error fetching count:', countErr);
          return res.status(500).json({ error: 'Failed to fetch employees' });
        }

        res.status(200).json({
          employees: data,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalEmployees: total,
            limit
          }
        });
      });
    });
  }

  // Create a new employee
  static createEmployee(req, res) {
    const { FullName, position, Department, salary, email, start_date } = req.body;

    if (!FullName || !position || !Department || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Ensure salary is a number for database
    const salaryNum = parseFloat(salary);
    if (isNaN(salaryNum) || salaryNum <= 0) {
      return res.status(400).json({ error: 'Invalid salary amount' });
    }

    const newEmployee = { 
      FullName, 
      position, 
      Department, 
      salary: salaryNum, 
      email,
      start_date: start_date || new Date().toISOString().split('T')[0]
    };
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
    console.log('Update employee request received:', req.params.id, req.body);
    const employeeId = req.params.id;
    const { FullName, position, Department, salary } = req.body;

    if (!FullName || !position || !Department || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const updatedData = { FullName, position, Department, salary };
    console.log('Updating employee with data:', updatedData);

    Employee.updateEmployee(employeeId, updatedData, (err, result) => {
      if (err) {
        console.error('Error updating employee:', err);
        return res.status(500).json({ error: 'Failed to update employee' });
      }

      console.log('Update result:', result);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      console.log('Employee updated successfully, sending response');
      res.status(200).json({ message: 'Employee updated successfully' });

      // Log this action asynchronously (don't wait for it)
      AuditLogModel.insertLog({
        userId: req.user.id,
        actions: 'UPDATE_EMPLOYEE',
        descriptions: `Employee ${employeeId} updated by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });
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

      res.status(200).json(employee);
    });
  }
}

module.exports = HrController;