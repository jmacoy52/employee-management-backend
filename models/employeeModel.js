const db = require('../config/db');

class EmployeeModel {
  // Get all employees with pagination
  static getAllEmployeesPaginated(organizationId, limit, offset, callback) {
    const query = 'SELECT * FROM employees WHERE organization_id = ? ORDER BY id DESC LIMIT ? OFFSET ?';
    db.query(query, [organizationId, limit, offset], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Get total count of employees
  static getTotalCount(organizationId, callback) {
    const query = 'SELECT COUNT(*) as total FROM employees WHERE organization_id = ?';
    db.query(query, [organizationId], (err, results) => {
      if (err) return callback(err);
      callback(null, results[0].total);
    });
  }

  // Get all employees (without pagination)
  static getAllEmployees(organizationId, callback) {
    const query = 'SELECT * FROM employees WHERE organization_id = ? ORDER BY id DESC';
    db.query(query, [organizationId], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Insert a new employee (created_at handled by DB)
  static insertEmployee(employeeData, callback) {
    const query = `
      INSERT INTO employees (organization_id, FullName, position, Department, email, salary, start_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      employeeData.organization_id,
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.email || null,
      employeeData.salary,
      employeeData.start_date || new Date().toISOString().split('T')[0]
    ];
    db.query(query, values, callback);
  }

  // Update employee by ID (include email too)
  static updateEmployee(id, employeeData, callback) {
    const query = `
      UPDATE employees
      SET FullName = ?, position = ?, Department = ?, salary = ?
      WHERE id = ? AND organization_id = ?
    `;
    const values = [
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.salary,
      id,
      employeeData.organization_id
    ];
    db.query(query, values, callback);
  }

  // Delete employee by ID
  static deleteEmployee(id, organizationId, callback) {
    const query = 'DELETE FROM employees WHERE id = ? AND organization_id = ?';
    db.query(query, [id, organizationId], callback);
  }

  // Get single employee by ID
  static getEmployeeById(id, organizationId, callback) {
    const query = 'SELECT * FROM employees WHERE id = ? AND organization_id = ?';
    db.query(query, [id, organizationId], (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]);
    });
  }

  // Check if email already exists (for validation)
  static findEmployeeByEmail(email, organizationId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM employees WHERE email = ? AND organization_id = ?';
      db.query(query, [email, organizationId], (err, results) => {
        if (err) return reject(err);
        if (results.length > 0) return resolve(results[0]);
        return resolve(null);
      });
    });
  }
}

module.exports = EmployeeModel;
