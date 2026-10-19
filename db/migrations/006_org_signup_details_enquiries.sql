-- Organisation sign-up details, rejection, and demo/contact enquiries.
--   organizations.status   gains 'rejected' = the platform owner declined the registration (no logins;
--                          the reason, if given, is shown to the admin when they try to sign in)
--   org_type, size_range   what kind of organisation and how many staff (fixed lists, see config/signupOptions.js)
--   country, city, phone   where they are and how to reach them
--   contact_name           contact person (contact_email already exists); defaults to the first admin
--   rejection_reason       optional note from the owner when rejecting
--   reviewed_at            when the owner last approved or rejected the registration
--   enquiries              "Request a demo" / contact form submissions, handled in the owner console
--     status               new -> contacted -> closed
ALTER TABLE organizations
  MODIFY status ENUM('pending', 'active', 'suspended', 'rejected') NOT NULL DEFAULT 'pending',
  ADD COLUMN org_type VARCHAR(60) NULL AFTER contact_email,
  ADD COLUMN size_range VARCHAR(20) NULL AFTER org_type,
  ADD COLUMN country VARCHAR(80) NULL AFTER size_range,
  ADD COLUMN city VARCHAR(80) NULL AFTER country,
  ADD COLUMN phone VARCHAR(40) NULL AFTER city,
  ADD COLUMN contact_name VARCHAR(100) NULL AFTER phone,
  ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER contact_name,
  ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER approved_at;

CREATE TABLE IF NOT EXISTS enquiries (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  organization_name  VARCHAR(150) NULL,
  email              VARCHAR(150) NOT NULL,
  phone              VARCHAR(40)  NULL,
  message            TEXT NOT NULL,
  status             ENUM('new', 'contacted', 'closed') NOT NULL DEFAULT 'new',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  contacted_at       TIMESTAMP NULL DEFAULT NULL,
  KEY idx_enquiries_status_created (status, created_at),
  KEY idx_enquiries_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
