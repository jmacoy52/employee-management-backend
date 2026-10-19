-- 010: owner billing controls.
--   'paused' status: billing stopped by the owner; the organisation has Free entitlements (data kept)
--   until the owner resumes it. paused_from remembers the status to return to.
ALTER TABLE organization_subscriptions
  MODIFY status ENUM('trialing', 'active', 'grace', 'free', 'paused') NOT NULL;

ALTER TABLE organization_subscriptions
  ADD COLUMN paused_at DATETIME NULL AFTER note,
  ADD COLUMN paused_from VARCHAR(20) NULL AFTER paused_at;
