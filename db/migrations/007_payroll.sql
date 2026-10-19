-- Payroll and payslips. All money is in whole pesewas (1 GHS = 100 pesewas, INT/BIGINT), never floats.
--   employee_pay_details  current pay set-up of one employee (one row per employee record)
--     basic_salary_pesewas   monthly basic salary (SSNIT is computed on this)
--     currency               ISO code shown on payslips (GHS by default)
--     bank_name, bank_account optional; shown (masked) on payslips
--     ssnit_number           optional SSNIT membership number, shown on payslips
--   employee_pay_items    named monthly line items: 'allowance' (taxable, added to gross) or
--                         'deduction' (other deductions after tax, e.g. loan repayment)
--   payroll_runs          one per organisation and month ('YYYY-MM'), with the pay date
--   payslips              one per employee and month: a SNAPSHOT of the employee details, the pay
--                         details, every amount and the tax rules used at the time it was created.
--                         Later changes to pay details or employee records never alter it.
--     status               draft (HR/admin only; can be deleted and recreated) -> published
--                          (visible to the employee; cannot be changed or deleted)
--     line_items           JSON: { allowances: [{name, amount}], deductions: [{name, amount}],
--                                  payeBands: [...], rules: {...} }
--     reference            unique payslip reference, e.g. PS-202609-4K7Q2M
-- employees.salary (existing) stays as the employee record's headline salary; saving pay details
-- keeps it equal to the basic salary.
CREATE TABLE IF NOT EXISTS employee_pay_details (
  employee_id           INT NOT NULL PRIMARY KEY,
  organization_id       INT NOT NULL,
  basic_salary_pesewas  INT UNSIGNED NOT NULL DEFAULT 0,
  currency              CHAR(3) NOT NULL DEFAULT 'GHS',
  bank_name             VARCHAR(100) NULL,
  bank_account          VARCHAR(40)  NULL,
  ssnit_number          VARCHAR(20)  NULL,
  updated_by            INT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pay_details_org (organization_id),
  CONSTRAINT fk_pay_details_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_details_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_pay_details_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS employee_pay_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  organization_id  INT NOT NULL,
  employee_id      INT NOT NULL,
  kind             ENUM('allowance', 'deduction') NOT NULL,
  name             VARCHAR(80) NOT NULL,
  amount_pesewas   INT UNSIGNED NOT NULL,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  KEY idx_pay_items_employee (employee_id, kind, sort_order),
  KEY idx_pay_items_org (organization_id),
  CONSTRAINT fk_pay_items_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_items_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payroll_runs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  organization_id  INT NOT NULL,
  period           CHAR(7) NOT NULL,
  pay_date         DATE NOT NULL,
  created_by       INT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll_runs_org_period (organization_id, period),
  CONSTRAINT fk_payroll_runs_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_payroll_runs_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_payroll_runs_period CHECK (period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payslips (
  id                         INT AUTO_INCREMENT PRIMARY KEY,
  organization_id            INT NOT NULL,
  payroll_run_id             INT NOT NULL,
  employee_id                INT NULL,
  period                     CHAR(7) NOT NULL,
  pay_date                   DATE NOT NULL,
  status                     ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  reference                  VARCHAR(30) NOT NULL,
  -- employee snapshot
  employee_name              VARCHAR(100) NOT NULL,
  employee_number            VARCHAR(20)  NOT NULL,
  employee_email             VARCHAR(150) NULL,
  department_name            VARCHAR(100) NULL,
  job_title                  VARCHAR(100) NULL,
  bank_name                  VARCHAR(100) NULL,
  bank_account               VARCHAR(40)  NULL,
  ssnit_number               VARCHAR(20)  NULL,
  currency                   CHAR(3) NOT NULL DEFAULT 'GHS',
  -- amounts (pesewas)
  basic_pesewas              INT UNSIGNED NOT NULL,
  allowances_pesewas         INT UNSIGNED NOT NULL,
  gross_pesewas              INT UNSIGNED NOT NULL,
  ssnit_employee_pesewas     INT UNSIGNED NOT NULL,
  taxable_pesewas            INT UNSIGNED NOT NULL,
  paye_pesewas               INT UNSIGNED NOT NULL,
  other_deductions_pesewas   INT UNSIGNED NOT NULL,
  net_pesewas                INT NOT NULL,
  ssnit_employer_pesewas     INT UNSIGNED NOT NULL,
  line_items                 JSON NOT NULL,
  created_by                 INT NULL,
  created_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at               TIMESTAMP NULL DEFAULT NULL,
  published_by               INT NULL,
  UNIQUE KEY uq_payslips_reference (reference),
  UNIQUE KEY uq_payslips_org_employee_period (organization_id, employee_id, period),
  KEY idx_payslips_run (payroll_run_id, status),
  KEY idx_payslips_employee (employee_id, status, period),
  CONSTRAINT fk_payslips_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_payslips_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id),
  -- A deleted employee record keeps its payslips (the snapshot has everything to show them)
  CONSTRAINT fk_payslips_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_payslips_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payslips_published_by FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
