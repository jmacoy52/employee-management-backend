const db = require('../config/db');

class EmployeeModel {
  // Get all employees
  // limit/offset keep the response bounded as the table grows
  static getAllEmployees(callback, { limit = 500, offset = 0 } = {}) {
    const query = `
      SELECT e.*, u.username AS linked_username, u.email AS linked_email
      FROM employees e LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.id DESC
      LIMIT ? OFFSET ?
    `;
    db.query(query, [limit, offset], (err, results) => {
      if (err) return callback(err);
      callback(null, results);
    });
  }

  // Insert a new employee (created_at handled by DB)
  static insertEmployee(employeeData, callback) {
    const query = `
      INSERT INTO employees (FullName, position, Department, email, salary)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.email || null,
      employeeData.salary
    ];
    db.query(query, values, callback);
  }

  // Update employee by ID (include email too)
  static updateEmployee(id, employeeData, callback) {
    const query = `
      UPDATE employees
      SET FullName = ?, position = ?, Department = ?, salary = ?
      WHERE id = ?
    `;
    const values = [
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.salary,
      id
    ];
    db.query(query, values, callback);
  }

  // Delete employee by ID
  static deleteEmployee(id, callback) {
    const query = 'DELETE FROM employees WHERE id = ?';
    db.query(query, [id], callback);
  }

  // Get single employee by ID
  static getEmployeeById(id, callback) {
    const query = 'SELECT * FROM employees WHERE id = ?';
    db.query(query, [id], (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]);
    });
  }

  // Link (userId) or unlink (null) a user account
  static setUser(id, userId, callback) {
    db.query('UPDATE employees SET user_id = ? WHERE id = ?', [userId, id], callback);
  }

  // Check if email already exists (for validation)
  static findEmployeeByEmail(email) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM employees WHERE email = ?';
      db.query(query, [email], (err, results) => {
        if (err) return reject(err);
        if (results.length > 0) return resolve(results[0]);
        return resolve(null);
      });
    });
  }
}

module.exports = EmployeeModel;
