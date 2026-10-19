const Department = require('../models/departmentModel');
const AuditLogModel = require('../models/auditLogModel');

const NAME_MAX = 100;
const DESCRIPTION_MAX = 255;

function audit(req, actions, descriptions) {
  AuditLogModel.insertLog({ userId: req.user.id, actions, descriptions }, (logErr) => {
    if (logErr) console.error(`Failed to log ${actions}:`, logErr.message);
  });
}

// Returns { name, description } or { error }
function readFields(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const description = body.description == null ? '' : String(body.description).trim();
  if (name.length < 2 || name.length > NAME_MAX) return { error: `Department name must be between 2 and ${NAME_MAX} characters` };
  if (description.length > DESCRIPTION_MAX) return { error: `Description must be at most ${DESCRIPTION_MAX} characters` };
  return { name, description: description || null };
}

const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function serverError(res, label, err) {
  console.error(`Error ${label}:`, err.message);
  return res.status(500).json({ error: `Failed to ${label}` });
}

class DepartmentController {
  // List departments with employee counts and heads (HR/Admin)
  static async list(req, res) {
    try {
      res.json(await Department.list());
    } catch (err) {
      serverError(res, 'fetch departments', err);
    }
  }

  // One department and its members
  static async get(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid department id' });
    try {
      const department = await Department.findById(id);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      res.json({ ...department, members: await Department.members(id) });
    } catch (err) {
      serverError(res, 'fetch department', err);
    }
  }

  static async create(req, res) {
    const fields = readFields(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });
    try {
      const id = await Department.create(fields);
      audit(req, 'CREATE_DEPARTMENT', `Department ${fields.name} created by ${req.user.email}`);
      res.status(201).json({ message: 'Department created', id });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A department with that name already exists' });
      serverError(res, 'create department', err);
    }
  }

  static async update(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid department id' });
    const fields = readFields(req.body);
    if (fields.error) return res.status(400).json({ error: fields.error });
    try {
      const before = await Department.findById(id);
      if (!before) return res.status(404).json({ error: 'Department not found' });
      await Department.update(id, fields);
      const renamed = before.name !== fields.name ? ` (renamed from ${before.name})` : '';
      audit(req, 'UPDATE_DEPARTMENT', `Department ${fields.name}${renamed} updated by ${req.user.email}`);
      res.json({ message: 'Department updated' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A department with that name already exists' });
      serverError(res, 'update department', err);
    }
  }

  // Activate / deactivate. Body: { is_active: boolean }
  static async setStatus(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid department id' });
    const isActive = req.body ? req.body.is_active : undefined;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'is_active must be true or false' });
    try {
      const department = await Department.findById(id);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      await Department.setActive(id, isActive);
      audit(req, isActive ? 'ACTIVATE_DEPARTMENT' : 'DEACTIVATE_DEPARTMENT',
        `Department ${department.name} ${isActive ? 'activated' : 'deactivated'} by ${req.user.email}`);
      res.json({ message: isActive ? 'Department activated' : 'Department deactivated' });
    } catch (err) {
      serverError(res, 'update department status', err);
    }
  }

  // Only an empty department can be deleted (409 otherwise)
  static async remove(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid department id' });
    try {
      const department = await Department.findById(id);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      const outcome = await Department.deleteIfEmpty(id);
      if (outcome === 'has_employees') {
        return res.status(409).json({ error: 'This department still has employees. Move them to another department or deactivate it instead.' });
      }
      if (outcome === 'not_found') return res.status(404).json({ error: 'Department not found' });
      audit(req, 'DELETE_DEPARTMENT', `Department ${department.name} deleted by ${req.user.email}`);
      res.json({ message: 'Department deleted' });
    } catch (err) {
      serverError(res, 'delete department', err);
    }
  }

  // Assign employees. Body: { employee_ids: number[] }. They leave their previous department.
  static async assign(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid department id' });
    const raw = req.body ? req.body.employee_ids : undefined;
    const ids = Array.isArray(raw) ? [...new Set(raw.map(toId))] : [];
    if (!ids.length || ids.includes(null) || ids.length > 500) {
      return res.status(400).json({ error: 'employee_ids must be a list of employee ids' });
    }
    try {
      const department = await Department.findById(id);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      if (!department.is_active) return res.status(409).json({ error: 'This department is deactivated. Activate it before adding employees.' });
      const found = await Department.employeesByIds(ids);
      if (found.length !== ids.length) return res.status(404).json({ error: 'One or more employees were not found' });
      await Department.assign(id, department.name, ids);
      audit(req, 'ASSIGN_DEPARTMENT', `Employee(s) ${ids.join(', ')} assigned to ${department.name} by ${req.user.email}`);
      res.json({ message: ids.length === 1 ? 'Employee assigned' : `${ids.length} employees assigned` });
    } catch (err) {
      serverError(res, 'assign employees', err);
    }
  }

  static async unassign(req, res) {
    const id = toId(req.params.id);
    const employeeId = toId(req.params.employeeId);
    if (!id || !employeeId) return res.status(400).json({ error: 'Invalid id' });
    try {
      const department = await Department.findById(id);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      const changed = await Department.unassign(id, employeeId);
      if (!changed) return res.status(404).json({ error: 'That employee is not in this department' });
      audit(req, 'UNASSIGN_DEPARTMENT', `Employee ${employeeId} removed from ${department.name} by ${req.user.email}`);
      res.json({ message: 'Employee removed from department' });
    } catch (err) {
      serverError(res, 'remove employee', err);
    }
  }

  // Set or clear the head. Body: { employee_id: number | null }; the head must be a member.
  static async setHead(req, res) {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid department id' });
    const raw = req.body ? req.body.employee_id : undefined;
    if (raw === undefined) return res.status(400).json({ error: 'employee_id is required (an employee id, or null to clear)' });
    const employeeId = raw === null || raw === '' ? null : toId(raw);
    if (raw !== null && raw !== '' && !employeeId) return res.status(400).json({ error: 'employee_id must be an employee id or null' });
    try {
      const department = await Department.findById(id);
      if (!department) return res.status(404).json({ error: 'Department not found' });
      if (employeeId) {
        const [employee] = await Department.employeesByIds([employeeId]);
        if (!employee) return res.status(404).json({ error: 'Employee not found' });
        if (employee.department_id !== id) return res.status(400).json({ error: 'The head of department must be a member of it. Assign them first.' });
      }
      await Department.setHead(id, employeeId);
      audit(req, 'SET_DEPARTMENT_HEAD', employeeId
        ? `Employee ${employeeId} set as head of ${department.name} by ${req.user.email}`
        : `Head of ${department.name} cleared by ${req.user.email}`);
      res.json({ message: employeeId ? 'Head of department set' : 'Head of department cleared' });
    } catch (err) {
      serverError(res, 'set head of department', err);
    }
  }
}

module.exports = DepartmentController;
