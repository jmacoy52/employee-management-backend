const db = require('../config/db');

// Departments (migration 004). Promise-based; raw SQL through the shared mysql2 pool.
const pool = db.promise();

const LIST_SQL = `
  SELECT d.id, d.name, d.description, d.is_active, d.head_employee_id, d.created_at, d.updated_at,
         h.FullName AS head_name, h.position AS head_position,
         (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS employee_count
  FROM departments d
  LEFT JOIN employees h ON h.id = d.head_employee_id`;

class DepartmentModel {
  // All departments with head and employee count (inactive ones too, flagged by is_active)
  static async list() {
    const [rows] = await pool.query(`${LIST_SQL} ORDER BY d.name`);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.query(`${LIST_SQL} WHERE d.id = ?`, [id]);
    return rows[0] || null;
  }

  // Case-insensitive (column collation) and trimmed
  static async findByName(name) {
    const [rows] = await pool.query('SELECT * FROM departments WHERE name = ?', [String(name).trim()]);
    return rows[0] || null;
  }

  static async members(id) {
    const [rows] = await pool.query(
      'SELECT id, FullName, email, position, user_id FROM employees WHERE department_id = ? ORDER BY FullName',
      [id]
    );
    return rows;
  }

  static async create({ name, description }) {
    const [result] = await pool.query(
      'INSERT INTO departments (name, description) VALUES (?, ?)',
      [name, description || null]
    );
    return result.insertId;
  }

  // Renaming also refreshes the employees.Department copy of the name
  static async update(id, { name, description }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'UPDATE departments SET name = ?, description = ? WHERE id = ?',
        [name, description || null, id]
      );
      await conn.query('UPDATE employees SET Department = ? WHERE department_id = ?', [name, id]);
      await conn.commit();
      return result.affectedRows;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async setActive(id, isActive) {
    const [result] = await pool.query('UPDATE departments SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    return result.affectedRows;
  }

  // Deletes only when no employee belongs to it; returns 'deleted' | 'not_found' | 'has_employees'
  static async deleteIfEmpty(id) {
    const [result] = await pool.query(
      'DELETE FROM departments WHERE id = ? AND NOT EXISTS (SELECT 1 FROM employees WHERE department_id = ?)',
      [id, id]
    );
    if (result.affectedRows) return 'deleted';
    return (await DepartmentModel.findById(id)) ? 'has_employees' : 'not_found';
  }

  // Moves employees into this department. Anyone who headed another department stops doing so.
  static async assign(id, name, employeeIds) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'UPDATE departments SET head_employee_id = NULL WHERE id <> ? AND head_employee_id IN (?)',
        [id, employeeIds]
      );
      const [result] = await conn.query(
        'UPDATE employees SET department_id = ?, Department = ? WHERE id IN (?)',
        [id, name, employeeIds]
      );
      await conn.commit();
      return result.affectedRows;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Removes one employee from this department (and from its head role)
  static async unassign(id, employeeId) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'UPDATE employees SET department_id = NULL, Department = NULL WHERE id = ? AND department_id = ?',
        [employeeId, id]
      );
      if (result.affectedRows) {
        await conn.query('UPDATE departments SET head_employee_id = NULL WHERE id = ? AND head_employee_id = ?', [id, employeeId]);
      }
      await conn.commit();
      return result.affectedRows;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async setHead(id, employeeId) {
    const [result] = await pool.query('UPDATE departments SET head_employee_id = ? WHERE id = ?', [employeeId, id]);
    return result.affectedRows;
  }

  static async clearHeadElsewhere(employeeId, departmentId) {
    await pool.query('UPDATE departments SET head_employee_id = NULL WHERE head_employee_id = ? AND id <> ?', [employeeId, departmentId]);
  }

  static async employeesByIds(ids) {
    const [rows] = await pool.query('SELECT id, department_id FROM employees WHERE id IN (?)', [ids]);
    return rows;
  }
}

module.exports = DepartmentModel;
