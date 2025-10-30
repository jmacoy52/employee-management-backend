const db = require('../config/db');

class EmployeeModel {
  // Get all employees
  static getAllEmployees(callback) {
    const query = 'SELECT * FROM employees ORDER BY id DESC';
    db.query(query, (err, results) => {
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
