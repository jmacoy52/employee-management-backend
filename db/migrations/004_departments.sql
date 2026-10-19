-- Departments become real records that HR (and admins) manage.
--   departments.head_employee_id  optional head of department; cleared if that employee is deleted
--   departments.is_active         0 = deactivated: kept for history, no new employees can join
--   employees.department_id       the employee's department (source of truth from now on)
--   employees.Department          kept as a read-only copy of the department name so older clients
--                                 and reports keep working; the API keeps it in sync. A later
--                                 migration can drop it once nothing reads it.
-- Existing free-text department values are turned into department rows (case-insensitive,
-- trimmed; the capitalised spelling wins) and every employee is linked to its row. An empty
-- database stays empty.
CREATE TABLE IF NOT EXISTS departments (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  description       VARCHAR(255) NULL,
  head_employee_id  INT NULL DEFAULT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_departments_name (name),
  KEY idx_departments_head (head_employee_id),
  CONSTRAINT fk_departments_head FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- CONVERT ... USING utf8mb4 keeps the comparisons valid whatever charset the old column has.
INSERT IGNORE INTO departments (name)
SELECT MIN(CONVERT(TRIM(Department) USING utf8mb4) COLLATE utf8mb4_bin) FROM employees
WHERE Department IS NOT NULL AND TRIM(Department) <> ''
GROUP BY CONVERT(TRIM(Department) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE employees
  MODIFY COLUMN Department VARCHAR(100) NULL,
  ADD COLUMN department_id INT NULL DEFAULT NULL,
  ADD KEY idx_employees_department_id (department_id),
  ADD CONSTRAINT fk_employees_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

UPDATE employees e JOIN departments d ON d.name = CONVERT(TRIM(e.Department) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci
SET e.department_id = d.id, e.Department = d.name;
