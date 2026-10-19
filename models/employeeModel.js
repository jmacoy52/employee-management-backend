const db = require('../config/db');

// Every method takes the organisation id (req.user.organizationId) and only ever reads or
// changes that organisation's rows. A record of another organisation behaves as if it did not exist.
function requireOrg(organizationId) {
  if (!Number.isInteger(organizationId) || organizationId < 1) throw new Error('Organisation scope is required');
  return organizationId;
}

class EmployeeModel {
  // Get all employees
  // limit/offset keep the response bounded as the table grows
  // departmentId (optional) filters to one department; 'none' = employees without one
  static getAllEmployees(organizationId, callback, { limit = 500, offset = 0, departmentId } = {}) {
    let where = 'WHERE e.organization_id = ?';
    const params = [requireOrg(organizationId)];
    if (departmentId === 'none') where += ' AND e.department_id IS NULL';
    else if (departmentId) {
      where += ' AND e.department_id = ?';
      params.push(departmentId);
    }
    const query = `
      SELECT e.*, d.name AS department_name, u.username AS linked_username, u.email AS linked_email
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN users u ON u.id = e.user_id
      ${where}
      ORDER BY e.id DESC
      LIMIT ? OFFSET ?
    `;
    db.query(query, [...params, limit, offset], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Insert a new employee (created_at handled by DB)
  static insertEmployee(organizationId, employeeData, callback) {
    const query = `
      INSERT INTO employees (organization_id, FullName, position, Department, department_id, email, salary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      requireOrg(organizationId),
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.department_id || null,
      employeeData.email || null,
      employeeData.salary
    ];
    db.query(query, values, callback);
  }

  // Update employee by ID (include email too)
  static updateEmployee(id, organizationId, employeeData, callback) {
    const query = `
      UPDATE employees
      SET FullName = ?, position = ?, Department = ?, department_id = ?, salary = ?
      WHERE id = ? AND organization_id = ?
    `;
    const values = [
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.department_id || null,
      employeeData.salary,
      id,
      requireOrg(organizationId)
    ];
    db.query(query, values, callback);
  }

  // Delete employee by ID
  static deleteEmployee(id, organizationId, callback) {
    const query = 'DELETE FROM employees WHERE id = ? AND organization_id = ?';
    db.query(query, [id, requireOrg(organizationId)], callback);
  }

  // Get single employee by ID
  static getEmployeeById(id, organizationId, callback) {
    const query = 'SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ? AND e.organization_id = ?';
    db.query(query, [id, requireOrg(organizationId)], (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]);
    });
  }

  // Link (userId) or unlink (null) a user account
  static setUser(id, organizationId, userId, callback) {
    db.query('UPDATE employees SET user_id = ? WHERE id = ? AND organization_id = ?', [userId, id, requireOrg(organizationId)], callback);
  }

  // Check if email already exists in this organisation (for validation)
  static findEmployeeByEmail(email, organizationId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM employees WHERE email = ? AND organization_id = ?';
      db.query(query, [email, requireOrg(organizationId)], (err, results) => {
        if (err) return reject(err);
        if (results.length > 0) return resolve(results[0]);
        return resolve(null);
      });
    });
  }
}

module.exports = EmployeeModel;
