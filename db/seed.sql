-- EmploCore demo data. Idempotent: rows are matched on unique email, so running
-- it again does not create duplicates.
--
-- Demo logins (change or delete these accounts before real use):
--   admin@emplocore.demo         Admin@EmploCore2026   (admin)
--   hr@emplocore.demo            Hr@EmploCore2026      (hr)
--   kwame.mensah@emplocore.demo  Staff@EmploCore2026   (employee)

INSERT IGNORE INTO users (username, email, password, role) VALUES
  ('Nana Agyeman',  'admin@emplocore.demo',        '$2b$10$5dG55g0EtXLHJplQug.tlORup3nPLTK5fXtQSZJiNQUOnZ1zm/sA6', 'admin'),
  ('Adwoa Boateng', 'hr@emplocore.demo',           '$2b$10$ow0sqpAivTegNPtK5XeZx.p.Q4HMri0loUWGxMyF46jyDimeQnFCS', 'hr'),
  ('Kwame Mensah',  'kwame.mensah@emplocore.demo', '$2b$10$B2DZ5nhnDgLQc5b16QzN2ej1mSWrEI3GHD2s/dwm9XVL1KzpNDpl.', 'employee');

INSERT IGNORE INTO user_profiles (user_id, first_name, last_name, phone, address)
SELECT id, 'Nana', 'Agyeman', '+233 20 000 0001', 'Airport Residential Area, Accra' FROM users WHERE email = 'admin@emplocore.demo';
INSERT IGNORE INTO user_profiles (user_id, first_name, last_name, phone, address)
SELECT id, 'Adwoa', 'Boateng', '+233 20 000 0002', 'East Legon, Accra' FROM users WHERE email = 'hr@emplocore.demo';
INSERT IGNORE INTO user_profiles (user_id, first_name, last_name, phone, address)
SELECT id, 'Kwame', 'Mensah', '+233 20 000 0003', 'Adenta, Accra' FROM users WHERE email = 'kwame.mensah@emplocore.demo';

INSERT IGNORE INTO employees (FullName, email, phone, position, Department, salary) VALUES
  ('Kwame Mensah',   'kwame.mensah@emplocore.demo',   '+233 20 000 0003', 'Software Engineer',      'Engineering', 9500.00),
  ('Efua Appiah',    'efua.appiah@emplocore.demo',    '+233 20 000 0004', 'QA Engineer',            'Engineering', 7800.00),
  ('Kofi Asante',    'kofi.asante@emplocore.demo',    '+233 20 000 0005', 'Accountant',             'Finance',     8200.00),
  ('Abena Owusu',    'abena.owusu@emplocore.demo',    '+233 20 000 0006', 'Payroll Officer',        'Finance',     6500.00),
  ('Akosua Darko',   'akosua.darko@emplocore.demo',   '+233 20 000 0007', 'Marketing Coordinator',  'Marketing',   6000.00),
  ('Yaw Ofori',      'yaw.ofori@emplocore.demo',      '+233 20 000 0008', 'Sales Executive',        'Sales',       5800.00),
  ('Kwabena Osei',   'kwabena.osei@emplocore.demo',   '+233 20 000 0009', 'Operations Supervisor',  'Operations',  7000.00),
  ('Esi Quaye',      'esi.quaye@emplocore.demo',      '+233 20 000 0010', 'HR Assistant',           'Human Resources', 5200.00);

-- Link the demo employee account to its employee record (needs migration 003).
UPDATE employees e JOIN users u ON u.email = e.email
SET e.user_id = u.id
WHERE e.email = 'kwame.mensah@emplocore.demo' AND e.user_id IS NULL;

-- A few starter audit entries so the Audit Log page is not empty.
INSERT INTO audit_logs (UserId, actions, descriptions)
SELECT u.id, 'SEED', 'Demo data loaded'
FROM users u
WHERE u.email = 'admin@emplocore.demo'
  AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE actions = 'SEED');

-- Demo departments (needs migration 004): one row per department used above, with a short
-- description and a head, and every demo employee linked to its department.
INSERT IGNORE INTO departments (name, description) VALUES
  ('Engineering',     'Builds and runs the company''s software products'),
  ('Finance',         'Accounts, payroll and financial reporting'),
  ('Marketing',       'Brand, campaigns and communications'),
  ('Sales',           'Customer acquisition and account management'),
  ('Operations',      'Logistics, facilities and day-to-day operations'),
  ('Human Resources', 'Recruitment, onboarding and staff welfare');

UPDATE employees e JOIN departments d ON d.name = e.Department
SET e.department_id = d.id
WHERE e.email LIKE '%@emplocore.demo' AND e.department_id IS NULL;

UPDATE departments d JOIN employees e ON e.email = 'kwame.mensah@emplocore.demo'
SET d.head_employee_id = e.id
WHERE d.name = 'Engineering' AND d.head_employee_id IS NULL;
UPDATE departments d JOIN employees e ON e.email = 'kofi.asante@emplocore.demo'
SET d.head_employee_id = e.id
WHERE d.name = 'Finance' AND d.head_employee_id IS NULL;
