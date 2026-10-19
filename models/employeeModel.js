const db = require('../config/db');

class EmployeeModel {
  // Get all employees
  // limit/offset keep the response bounded as the table grows
  // departmentId (optional) filters to one department; 'none' = employees without one
  static getAllEmployees(callback, { limit = 500, offset = 0, departmentId } = {}) {
    let where = '';
    const params = [];
    if (departmentId === 'none') where = 'WHERE e.department_id IS NULL';
    else if (departmentId) {
      where = 'WHERE e.department_id = ?';
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
  static insertEmployee(employeeData, callback) {
    const query = `
      INSERT INTO employees (FullName, position, Department, department_id, email, salary)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [
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
  static updateEmployee(id, employeeData, callback) {
    const query = `
      UPDATE employees
      SET FullName = ?, position = ?, Department = ?, department_id = ?, salary = ?
      WHERE id = ?
    `;
    const values = [
      employeeData.FullName,
      employeeData.position,
      employeeData.Department,
      employeeData.department_id || null,
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
    const query = 'SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ?';
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
