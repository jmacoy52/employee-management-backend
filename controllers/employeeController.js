const Employee = require('../models/employeeModel');
const AuditLogModel = require('../models/auditLogModel');
const UserModel = require('../models/userModel');
const { pagination } = require('../config/pagination');
const { isProtectedEmail, employeeProtection, sendDemoProtected } = require('../config/demoAccounts');
const DepartmentModel = require('../models/departmentModel');

// Works out the department for a create/update: department_id (preferred) or the older
// free-text Department name, which is matched to an existing department or creates one.
// Resolves { department_id, Department } or { status, error }.
async function resolveDepartment(body, req) {
  const rawId = body.department_id;
  if (rawId !== undefined && rawId !== null && rawId !== '') {
    const id = Number(rawId);
    const department = Number.isInteger(id) ? await DepartmentModel.findById(id) : null;
    if (!department) return { status: 400, error: 'Department not found' };
    return { department };
  }
  const name = String(body.Department || '').trim().replace(/\s+/g, ' ');
  if (!name) return { status: 400, error: 'Department is required' };
  let department = await DepartmentModel.findByName(name);
  if (!department) {
    const id = await DepartmentModel.create({ name });
    AuditLogModel.insertLog({ userId: req.user.id, actions: 'CREATE_DEPARTMENT', descriptions: `Department ${name} created by ${req.user.email}` },
      (logErr) => { if (logErr) console.error('Failed to insert audit log:', logErr); });
    department = await DepartmentModel.findById(id);
  }
  return { department };
}

// Like resolveDepartment, but a new employee cannot join a deactivated department
async function departmentFor(body, req, currentDepartmentId) {
  const outcome = await resolveDepartment(body, req);
  if (outcome.error) return outcome;
  const { department } = outcome;
  if (!department.is_active && department.id !== currentDepartmentId) {
    return { status: 409, error: `${department.name} is deactivated. Choose an active department.` };
  }
  return { department_id: department.id, Department: department.name };
}

// ?department_id=<id> or ?department_id=none
function departmentFilter(value) {
  if (value === 'none') return 'none';
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

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
    }, { ...pagination(req.query), departmentId: departmentFilter(req.query.department_id) });
  }

  // Create a new employee
  static async createEmployee(req, res) {
    const { FullName, position, salary, email } = req.body;

    if (!FullName || !position || (!req.body.Department && !req.body.department_id) || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    let department;
    try {
      department = await departmentFor(req.body, req);
    } catch (err) {
      console.error('Error resolving department:', err.message);
      return res.status(500).json({ error: 'Failed to insert employee' });
    }
    if (department.error) return res.status(department.status).json({ error: department.error });

    const newEmployee = { FullName, position, ...department, salary, email };
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
  static async updateEmployee(req, res) {
    const employeeId = req.params.id;
    const { FullName, position, salary } = req.body;

    if (!FullName || !position || (!req.body.Department && !req.body.department_id) || !salary) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    let department;
    try {
      const current = await new Promise((resolve, reject) =>
        Employee.getEmployeeById(employeeId, (err, row) => (err ? reject(err) : resolve(row))));
      if (!current) return res.status(404).json({ error: 'Employee not found' });
      department = await departmentFor(req.body, req, current.department_id);
    } catch (err) {
      console.error('Error resolving department:', err.message);
      return res.status(500).json({ error: 'Failed to update employee' });
    }
    if (department.error) return res.status(department.status).json({ error: department.error });

    const updatedData = { FullName, position, ...department, salary };

    Employee.updateEmployee(employeeId, updatedData, (err, result) => {
      if (err) {
        console.error('Error updating employee:', err);
        return res.status(500).json({ error: 'Failed to update employee' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Someone who moved to another department no longer heads their old one
      DepartmentModel.clearHeadElsewhere(employeeId, department.department_id)
        .catch((headErr) => console.error('Failed to clear head of department:', headErr.message));

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



