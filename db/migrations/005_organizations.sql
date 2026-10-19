-- Multi-tenancy: one platform, many client organisations.
--   organizations           one row per client organisation (tenant)
--     status                pending   = signed up, waiting for the platform owner's approval (no logins)
--                           active    = normal use
--                           suspended = logins and existing sessions are refused; data is kept
--     plan, seat_limit      commercial fields; seat_limit NULL = unlimited active user accounts.
--                           Billing (e.g. Paystack) can later drive plan/status; there is no payment code yet.
--   users.organization_id   the organisation an account belongs to. NULL only for the platform
--                           'owner' role (enforced by chk_users_org_role).
--   employees / departments organization_id NOT NULL; e-mail and department name are unique per organisation.
--   audit_logs              organization_id NULL = platform-level event (e.g. owner bootstrap).
-- Password reset tokens need no column: they belong to a user, and the user carries the organisation.
-- Every existing row (the public demo data) is moved into one organisation, "EmploCore Demo"
-- (slug "demo", active). An empty database stays empty: the demo organisation is only created
-- when there is data to put in it (db/seed.sql creates it for a fresh demo).
CREATE TABLE IF NOT EXISTS organizations (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  slug           VARCHAR(80)  NOT NULL,
  status         ENUM('pending', 'active', 'suspended') NOT NULL DEFAULT 'pending',
  plan           VARCHAR(40)  NOT NULL DEFAULT 'standard',
  seat_limit     INT NULL DEFAULT NULL,
  contact_email  VARCHAR(150) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  approved_at    TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_organizations_slug (slug),
  KEY idx_organizations_status (status),
  KEY idx_organizations_created_at (created_at),
  CONSTRAINT chk_organizations_seat_limit CHECK (seat_limit IS NULL OR seat_limit >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO organizations (name, slug, status, approved_at)
SELECT 'EmploCore Demo', 'demo', 'active', CURRENT_TIMESTAMP FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'demo')
  AND (EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM employees)
       OR EXISTS (SELECT 1 FROM departments) OR EXISTS (SELECT 1 FROM audit_logs));

SET @demo_org_id = (SELECT id FROM organizations WHERE slug = 'demo');

-- users: nullable (the owner has no organisation); no ON DELETE action, so an organisation
-- that still has accounts cannot be deleted.
ALTER TABLE users
  ADD COLUMN organization_id INT NULL DEFAULT NULL AFTER id,
  ADD KEY idx_users_organization (organization_id),
  ADD CONSTRAINT fk_users_organization FOREIGN KEY (organization_id) REFERENCES organizations(id);
UPDATE users SET organization_id = @demo_org_id WHERE organization_id IS NULL AND role <> 'owner';
ALTER TABLE users
  ADD CONSTRAINT chk_users_org_role CHECK ((role = 'owner') = (organization_id IS NULL));

-- employees: required; same e-mail may exist in two organisations, not twice in one.
ALTER TABLE employees
  ADD COLUMN organization_id INT NULL DEFAULT NULL AFTER id;
UPDATE employees SET organization_id = @demo_org_id WHERE organization_id IS NULL;
ALTER TABLE employees
  MODIFY COLUMN organization_id INT NOT NULL,
  DROP INDEX uq_employees_email,
  ADD UNIQUE KEY uq_employees_org_email (organization_id, email),
  ADD KEY idx_employees_organization_department (organization_id, department_id),
  ADD CONSTRAINT fk_employees_organization FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- departments: required; names unique per organisation. Removed with an (empty) organisation.
ALTER TABLE departments
  ADD COLUMN organization_id INT NULL DEFAULT NULL AFTER id;
UPDATE departments SET organization_id = @demo_org_id WHERE organization_id IS NULL;
ALTER TABLE departments
  MODIFY COLUMN organization_id INT NOT NULL,
  DROP INDEX uq_departments_name,
  ADD UNIQUE KEY uq_departments_org_name (organization_id, name),
  ADD CONSTRAINT fk_departments_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- audit_logs: nullable for platform-level events; history is kept if an organisation is deleted.
ALTER TABLE audit_logs
  ADD COLUMN organization_id INT NULL DEFAULT NULL AFTER LogId,
  ADD KEY idx_audit_logs_organization_created (organization_id, created_at),
  ADD CONSTRAINT fk_audit_logs_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
UPDATE audit_logs SET organization_id = @demo_org_id WHERE organization_id IS NULL;
