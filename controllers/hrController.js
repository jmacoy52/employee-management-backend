const Employee = require('../models/employeeModel');
const AuditLogModel = require('../models/auditLogModel');
const NotificationModel = require('../models/notificationModel');

class HrController {
  // Get all employees
  static getEmployees(req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const organizationId = req.user.organization_id;

    Employee.getAllEmployeesPaginated(organizationId, limit, offset, (err, data) => {
      if (err) {
        console.error('Error fetching employees:', err);
        return res.status(500).json({ error: 'Failed to fetch employees' });
      }

      Employee.getTotalCount(organizationId, (countErr, total) => {
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
      organization_id: req.user.organization_id,
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
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'CREATE_EMPLOYEE',
        description: `Employee ${FullName} created by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });

      res.status(201).json({ message: 'Employee created successfully', id: result.insertId });

      NotificationModel.createSystemNotification({
        organization_id: req.user.organization_id,
        type: 'success',
        title: 'Employee created',
        message: `${FullName} was added to the employee directory.`,
        icon: 'CheckCircle',
        color: 'text-emerald-500'
      }, () => {});
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

    const updatedData = { organization_id: req.user.organization_id, FullName, position, Department, salary };
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

      NotificationModel.createSystemNotification({
        organization_id: req.user.organization_id,
        type: 'info',
        title: 'Employee updated',
        message: `${FullName} was updated by ${req.user.username || req.user.email}.`,
        icon: 'Bell',
        color: 'text-sky-500'
      }, () => {});

      // Log this action asynchronously (don't wait for it)
      AuditLogModel.insertLog({
        organizationId: req.user.organization_id,
        userId: req.user.id,
        action: 'UPDATE_EMPLOYEE',
        description: `Employee ${employeeId} updated by ${req.user.email}`
      }, (logErr) => {
        if (logErr) console.error('Failed to insert audit log:', logErr);
      });
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

      NotificationModel.createSystemNotification({
        organization_id: req.user.organization_id,
        type: 'warning',
        title: 'Employee deleted',
        message: `Employee record ${employeeId} was removed from the tenant directory.`,
        icon: 'AlertCircle',
        color: 'text-amber-500'
      }, () => {});
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

module.exports = HrController;
