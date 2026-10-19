-- Audit-log visibility and last sign-in.
--   audit_logs.scope       who may read an entry (everything is still logged; this only changes readers)
--                          'platform' = owner actions and organisation-level events (registrations,
--                                       approve/reject, suspend/reactivate, organisation edits and deletes,
--                                       enquiries, owner support actions on an organisation's admins)
--                          'tenant'   = routine activity inside an organisation (staff, employees,
--                                       departments, payroll, sign-ins ...)
--                          The platform owner reads 'platform' entries only. An organisation admin reads
--                          every entry filed under their own organisation_id, whatever its scope.
--                          HR and employee accounts cannot read the audit log.
--   users.last_login_at    time of the last successful sign-in (NULL = never, or before this migration)
ALTER TABLE audit_logs
  ADD COLUMN scope ENUM('tenant', 'platform') NOT NULL DEFAULT 'tenant' AFTER organization_id,
  ADD KEY idx_audit_logs_scope_created (scope, created_at);

-- Backfill: organisation-level actions, and anything an owner account did
UPDATE audit_logs SET scope = 'platform'
WHERE actions IN ('REGISTER_ORGANIZATION', 'CREATE_ORGANIZATION', 'UPDATE_ORGANIZATION', 'DELETE_ORGANIZATION',
                  'APPROVE_ORGANIZATION', 'REJECT_ORGANIZATION', 'SUSPEND_ORGANIZATION', 'REACTIVATE_ORGANIZATION',
                  'CREATE_ENQUIRY', 'UPDATE_ENQUIRY', 'DELETE_ENQUIRY',
                  'BOOTSTRAP_OWNER', 'CREATE_OWNER', 'UPDATE_OWNER_ACCOUNT', 'CREATE_ADMIN')
   OR UserId IN (SELECT id FROM (SELECT id FROM users WHERE role = 'owner') AS owners);

ALTER TABLE users
  ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL;

-- Backfill from the sign-ins already in the audit log
UPDATE users u
  JOIN (SELECT UserId, MAX(created_at) AS last_at FROM audit_logs WHERE actions = 'LOGIN' GROUP BY UserId) l
    ON l.UserId = u.id
SET u.last_login_at = l.last_at;
