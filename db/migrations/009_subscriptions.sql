-- Subscriptions and billing (Paystack).
--   plans                       the price list. Seeded below; the platform owner edits prices, limits and copy in
--                               the owner console (Plans), so no code change is needed for a price change.
--                               Money is in pesewas (GHS 1 = 100 pesewas). NULL price = custom (Enterprise).
--                               included_employees NULL = no limit; extra_employee_pesewas NULL = no extras
--                               (hard cap); max_admins / max_hr NULL = unlimited active accounts of that role.
--   organization_subscriptions  one row per organisation: its plan and billing state.
--                               status    trialing = free trial of the trial plan (Growth); trial_ends_at NULL
--                                                    means the trial has not started (organisation still pending)
--                                         active   = paid (or owner-assigned / exempt) and in force
--                                         grace    = a payment failed, a subscription or trial ended: the plan keeps
--                                                    working until grace_ends_at, then the organisation drops to Free
--                                         free     = the Free plan
--                               billing_mode paystack = self-serve through Paystack
--                                            manual   = assigned by the platform owner (comp, Enterprise)
--                                            exempt   = never billed (the public demo organisation)
--   billing_checkouts           a Paystack payment the organisation admin started (reference = Paystack reference)
--   billing_payments            payment history (successful and failed charges); successful ones get an invoice number
--   billing_events              every Paystack webhook received; event_key is unique, so a repeated delivery is
--                               recognised and not applied twice
--   billing_coupons / billing_coupon_redemptions   discounts such as the founding-customer offer
--   billing_notices             in-app notices (trial ending, renewal, grace, downgrade); dedupe_key is unique so
--                               the daily job can run twice without duplicating them
--   billing_job_runs            one row per run of the daily billing job (monitoring)
-- Data is never deleted by billing: an organisation that drops to Free keeps everything; data above the
-- Free limits becomes read-only.
CREATE TABLE IF NOT EXISTS plans (
  code                      VARCHAR(20)  NOT NULL PRIMARY KEY,
  name                      VARCHAR(60)  NOT NULL,
  tagline                   VARCHAR(160) NULL,
  price_monthly_pesewas     INT NULL,
  price_yearly_pesewas      INT NULL,
  included_employees        INT NULL,
  extra_employee_pesewas    INT NULL,
  max_admins                INT NULL,
  max_hr                    INT NULL,
  feature_payroll           TINYINT(1) NOT NULL DEFAULT 0,
  feature_audit_log         TINYINT(1) NOT NULL DEFAULT 0,
  feature_priority_support  TINYINT(1) NOT NULL DEFAULT 0,
  features_text             TEXT NULL,
  is_public                 TINYINT(1) NOT NULL DEFAULT 1,
  is_self_serve             TINYINT(1) NOT NULL DEFAULT 1,
  is_highlighted            TINYINT(1) NOT NULL DEFAULT 0,
  sort_order                INT NOT NULL DEFAULT 0,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_plans_prices CHECK ((price_monthly_pesewas IS NULL OR price_monthly_pesewas >= 0)
                                 AND (price_yearly_pesewas IS NULL OR price_yearly_pesewas >= 0)
                                 AND (extra_employee_pesewas IS NULL OR extra_employee_pesewas >= 0)),
  CONSTRAINT chk_plans_limits CHECK ((included_employees IS NULL OR included_employees >= 0)
                                 AND (max_admins IS NULL OR max_admins >= 1) AND (max_hr IS NULL OR max_hr >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO plans (code, name, tagline, price_monthly_pesewas, price_yearly_pesewas, included_employees,
  extra_employee_pesewas, max_admins, max_hr, feature_payroll, feature_audit_log, feature_priority_support,
  features_text, is_public, is_self_serve, is_highlighted, sort_order) VALUES
('free', 'Free', 'For very small teams getting organised', 0, 0, 5, NULL, 1, 0, 0, 0, 0,
 'Employee records\nDepartments and roles\n1 admin account', 1, 0, 0, 1),
('starter', 'Starter', 'Payroll for small teams', 9900, 99000, 15, 600, 1, 1, 1, 0, 0,
 'Everything in Free\nPayroll with Ghana PAYE and SSNIT\nPDF and printable payslips\nEmployee self-service: My payslips\n1 admin and 1 HR account', 1, 1, 0, 2),
('growth', 'Growth', 'For growing organisations with an HR team', 24900, 249000, 50, 500, NULL, NULL, 1, 1, 1,
 'Everything in Starter\nUnlimited HR accounts\nOrganisation audit log\nPriority e-mail and WhatsApp support', 1, 1, 1, 3),
('business', 'Business', 'For established organisations', 54900, 549000, 150, 400, NULL, NULL, 1, 1, 1,
 'Everything in Growth\nOnboarding help: we import your data\nPhone support', 1, 1, 0, 4),
('enterprise', 'Enterprise', 'More than 150 employees or custom terms', NULL, NULL, NULL, NULL, NULL, NULL, 1, 1, 1,
 'Everything in Business\nLimits and terms agreed with you\nPriced to fit your organisation', 1, 0, 0, 5);

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  organization_id             INT NOT NULL PRIMARY KEY,
  plan_code                   VARCHAR(20) NOT NULL,
  status                      ENUM('trialing', 'active', 'grace', 'free') NOT NULL,
  billing_mode                ENUM('paystack', 'manual', 'exempt') NOT NULL DEFAULT 'paystack',
  billing_interval            ENUM('monthly', 'yearly') NULL,
  trial_ends_at               DATETIME NULL,
  current_period_end          DATETIME NULL,
  cancel_at_period_end        TINYINT(1) NOT NULL DEFAULT 0,
  grace_ends_at               DATETIME NULL,
  grace_reason                ENUM('trial_ended', 'payment_failed', 'subscription_ended') NULL,
  amount_pesewas              INT NULL,
  extra_employees_billed      INT NOT NULL DEFAULT 0,
  discount_coupon             VARCHAR(40) NULL,
  discount_percent            TINYINT UNSIGNED NULL,
  discount_ends_at            DATETIME NULL,
  employee_limit_override     INT NULL,
  manual_monthly_pesewas      INT NULL,
  manual_until                DATETIME NULL,
  paystack_customer_code      VARCHAR(100) NULL,
  paystack_subscription_code  VARCHAR(100) NULL,
  paystack_email_token        VARCHAR(100) NULL,
  paystack_plan_code          VARCHAR(100) NULL,
  last_payment_status         ENUM('success', 'failed') NULL,
  last_payment_at             DATETIME NULL,
  note                        VARCHAR(255) NULL,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_subscriptions_status (status),
  KEY idx_subscriptions_paystack_sub (paystack_subscription_code),
  KEY idx_subscriptions_paystack_plan (paystack_plan_code),
  CONSTRAINT fk_subscriptions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_code) REFERENCES plans(code),
  CONSTRAINT chk_subscriptions_discount CHECK (discount_percent IS NULL OR discount_percent BETWEEN 1 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS billing_checkouts (
  reference            VARCHAR(100) NOT NULL PRIMARY KEY,
  organization_id      INT NOT NULL,
  plan_code            VARCHAR(20) NOT NULL,
  billing_interval     ENUM('monthly', 'yearly') NOT NULL,
  amount_pesewas       INT NOT NULL,
  base_pesewas         INT NOT NULL,
  extra_employees      INT NOT NULL DEFAULT 0,
  discount_coupon      VARCHAR(40) NULL,
  discount_percent     TINYINT UNSIGNED NULL,
  paystack_plan_code   VARCHAR(100) NULL,
  status               ENUM('pending', 'success', 'failed', 'abandoned') NOT NULL DEFAULT 'pending',
  created_by           INT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at         DATETIME NULL,
  KEY idx_checkouts_org (organization_id, created_at),
  KEY idx_checkouts_paystack_plan (paystack_plan_code),
  CONSTRAINT fk_checkouts_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS billing_payments (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  organization_id          INT NOT NULL,
  reference                VARCHAR(100) NOT NULL,
  invoice_number           VARCHAR(30) NULL,
  plan_code                VARCHAR(20) NULL,
  billing_interval         ENUM('monthly', 'yearly') NULL,
  amount_pesewas           INT NOT NULL,
  currency                 CHAR(3) NOT NULL DEFAULT 'GHS',
  status                   ENUM('success', 'failed') NOT NULL,
  channel                  VARCHAR(30) NULL,
  paystack_transaction_id  BIGINT NULL,
  description              VARCHAR(255) NULL,
  period_start             DATETIME NULL,
  period_end               DATETIME NULL,
  paid_at                  DATETIME NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_reference (reference),
  UNIQUE KEY uq_payments_invoice (invoice_number),
  KEY idx_payments_org (organization_id, created_at),
  CONSTRAINT fk_payments_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS billing_events (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  provider         VARCHAR(20) NOT NULL DEFAULT 'paystack',
  event_key        VARCHAR(191) NOT NULL,
  event_type       VARCHAR(60) NOT NULL,
  organization_id  INT NULL,
  status           ENUM('processing', 'processed', 'ignored', 'failed') NOT NULL DEFAULT 'processing',
  error            VARCHAR(255) NULL,
  payload          JSON NULL,
  received_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at     DATETIME NULL,
  UNIQUE KEY uq_billing_events_key (event_key),
  KEY idx_billing_events_org (organization_id, received_at),
  CONSTRAINT fk_billing_events_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS billing_coupons (
  code              VARCHAR(40) NOT NULL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  percent_off       TINYINT UNSIGNED NOT NULL,
  duration_months   INT NOT NULL,
  max_redemptions   INT NULL,
  redeemed_count    INT NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  auto_apply        TINYINT(1) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_coupons_percent CHECK (percent_off BETWEEN 1 AND 100),
  CONSTRAINT chk_coupons_duration CHECK (duration_months BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Founding-customer offer: the first 25 paying organisations get 40% off for 12 months (applied automatically at
-- their first payment while the coupon is active and places remain; the owner can switch it off).
INSERT IGNORE INTO billing_coupons (code, name, percent_off, duration_months, max_redemptions, is_active, auto_apply)
VALUES ('FOUNDING40', 'Founding customer offer', 40, 12, 25, 1, 1);

CREATE TABLE IF NOT EXISTS billing_coupon_redemptions (
  coupon_code      VARCHAR(40) NOT NULL,
  organization_id  INT NOT NULL,
  redeemed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at          DATETIME NOT NULL,
  applied_by       INT NULL,
  PRIMARY KEY (coupon_code, organization_id),
  CONSTRAINT fk_redemptions_coupon FOREIGN KEY (coupon_code) REFERENCES billing_coupons(code),
  CONSTRAINT fk_redemptions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS billing_notices (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  organization_id  INT NOT NULL,
  kind             VARCHAR(40) NOT NULL,
  message          VARCHAR(500) NOT NULL,
  dedupe_key       VARCHAR(191) NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismissed_at     DATETIME NULL,
  UNIQUE KEY uq_billing_notices_dedupe (dedupe_key),
  KEY idx_billing_notices_org (organization_id, dismissed_at, created_at),
  CONSTRAINT fk_billing_notices_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS billing_job_runs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  started_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME NULL,
  status       ENUM('running', 'ok', 'failed') NOT NULL DEFAULT 'running',
  summary      VARCHAR(1000) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Backfill: every existing organisation gets a subscription row.
--   the public demo organisation (slug 'demo'): Growth, exempt from billing, permanently
--   active or suspended organisations: a 30-day Growth trial starting now (no data is touched)
--   pending or rejected registrations: a Growth trial that starts when the owner approves them
INSERT IGNORE INTO organization_subscriptions (organization_id, plan_code, status, billing_mode, trial_ends_at)
SELECT id, 'growth',
       IF(slug = 'demo', 'active', 'trialing'),
       IF(slug = 'demo', 'exempt', 'paystack'),
       CASE WHEN slug = 'demo' THEN NULL
            WHEN status IN ('active', 'suspended') THEN UTC_TIMESTAMP() + INTERVAL 30 DAY
            ELSE NULL END
FROM organizations;

-- organizations.plan now mirrors the subscription's plan code (kept for the owner console lists)
UPDATE organizations o JOIN organization_subscriptions s ON s.organization_id = o.id SET o.plan = s.plan_code;
ALTER TABLE organizations MODIFY plan VARCHAR(40) NOT NULL DEFAULT 'growth';
