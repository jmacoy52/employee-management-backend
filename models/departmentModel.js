const db = require('../config/db');

// Departments (migration 004). Promise-based; raw SQL through the shared mysql2 pool.
// Every method takes the organisation id (req.user.organizationId, migration 005) and only reads
// or changes that organisation's departments and employees.
const pool = db.promise();

function requireOrg(organizationId) {
  if (!Number.isInteger(organizationId) || organizationId < 1) throw new Error('Organisation scope is required');
  return organizationId;
}

const LIST_SQL = `
  SELECT d.id, d.name, d.description, d.is_active, d.head_employee_id, d.created_at, d.updated_at,
         h.FullName AS head_name, h.position AS head_position,
         (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS employee_count
  FROM departments d
  LEFT JOIN employees h ON h.id = d.head_employee_id`;

class DepartmentModel {
  // All departments with head and employee count (inactive ones too, flagged by is_active)
  static async list(organizationId) {
    const [rows] = await pool.query(`${LIST_SQL} WHERE d.organization_id = ? ORDER BY d.name`, [requireOrg(organizationId)]);
    return rows;
  }

  static async findById(id, organizationId) {
    const [rows] = await pool.query(`${LIST_SQL} WHERE d.id = ? AND d.organization_id = ?`, [id, requireOrg(organizationId)]);
    return rows[0] || null;
  }

  // Case-insensitive (column collation) and trimmed
  static async findByName(name, organizationId) {
    const [rows] = await pool.query('SELECT * FROM departments WHERE name = ? AND organization_id = ?', [String(name).trim(), requireOrg(organizationId)]);
    return rows[0] || null;
  }

  static async members(id, organizationId) {
    const [rows] = await pool.query(
      'SELECT id, FullName, email, position, user_id FROM employees WHERE department_id = ? AND organization_id = ? ORDER BY FullName',
      [id, requireOrg(organizationId)]
    );
    return rows;
  }

  static async create(organizationId, { name, description }) {
    const [result] = await pool.query(
      'INSERT INTO departments (organization_id, name, description) VALUES (?, ?, ?)',
      [requireOrg(organizationId), name, description || null]
    );
    return result.insertId;
  }

  // Renaming also refreshes the employees.Department copy of the name
  static async update(id, organizationId, { name, description }) {
    requireOrg(organizationId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'UPDATE departments SET name = ?, description = ? WHERE id = ? AND organization_id = ?',
        [name, description || null, id, organizationId]
      );
      await conn.query('UPDATE employees SET Department = ? WHERE department_id = ? AND organization_id = ?', [name, id, organizationId]);
      await conn.commit();
      return result.affectedRows;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async setActive(id, organizationId, isActive) {
    const [result] = await pool.query('UPDATE departments SET is_active = ? WHERE id = ? AND organization_id = ?', [isActive ? 1 : 0, id, requireOrg(organizationId)]);
    return result.affectedRows;
  }

  // Deletes only when no employee belongs to it; returns 'deleted' | 'not_found' | 'has_employees'
  static async deleteIfEmpty(id, organizationId) {
    const [result] = await pool.query(
      'DELETE FROM departments WHERE id = ? AND organization_id = ? AND NOT EXISTS (SELECT 1 FROM employees WHERE department_id = ?)',
      [id, requireOrg(organizationId), id]
    );
    if (result.affectedRows) return 'deleted';
    return (await DepartmentModel.findById(id, organizationId)) ? 'has_employees' : 'not_found';
  }

  // Moves employees into this department. Anyone who headed another department stops doing so.
  static async assign(id, organizationId, name, employeeIds) {
    requireOrg(organizationId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        'UPDATE departments SET head_employee_id = NULL WHERE id <> ? AND organization_id = ? AND head_employee_id IN (?)',
        [id, organizationId, employeeIds]
      );
      const [result] = await conn.query(
        'UPDATE employees SET department_id = ?, Department = ? WHERE id IN (?) AND organization_id = ?',
        [id, name, employeeIds, organizationId]
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
  static async unassign(id, organizationId, employeeId) {
    requireOrg(organizationId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        'UPDATE employees SET department_id = NULL, Department = NULL WHERE id = ? AND department_id = ? AND organization_id = ?',
        [employeeId, id, organizationId]
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

  static async setHead(id, organizationId, employeeId) {
    const [result] = await pool.query('UPDATE departments SET head_employee_id = ? WHERE id = ? AND organization_id = ?', [employeeId, id, requireOrg(organizationId)]);
    return result.affectedRows;
  }

  static async clearHeadElsewhere(organizationId, employeeId, departmentId) {
    await pool.query('UPDATE departments SET head_employee_id = NULL WHERE head_employee_id = ? AND id <> ? AND organization_id = ?', [employeeId, departmentId, requireOrg(organizationId)]);
  }

  // Only employees of this organisation are returned; ids from elsewhere are simply missing
  static async employeesByIds(ids, organizationId) {
    const [rows] = await pool.query('SELECT id, department_id FROM employees WHERE id IN (?) AND organization_id = ?', [ids, requireOrg(organizationId)]);
    return rows;
  }
}

module.exports = DepartmentModel;
