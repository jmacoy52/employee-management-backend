-- Account activation/deactivation, token revocation and forced password change.
--   is_active             0 = deactivated: login and existing tokens are rejected
--   token_version         bumped on logout, password change, role change and deactivation;
--                         tokens carrying an older version are rejected
--   must_change_password  set when an admin issues a temporary password
ALTER TABLE users
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN token_version INT NOT NULL DEFAULT 0,
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL;
