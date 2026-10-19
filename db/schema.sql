-- EmploCore backend (v1 API) schema. MySQL 8.x.
-- Safe to run repeatedly: every table uses CREATE TABLE IF NOT EXISTS.
-- Column names match what the models and the React frontend use
-- (employees.FullName/Department, audit_logs.LogId/UserId/actions/descriptions).

CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL,
  password    VARCHAR(255) NOT NULL,              -- bcrypt hash
  role        VARCHAR(20)  NOT NULL DEFAULT 'employee', -- employee | hr | admin
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  first_name  VARCHAR(100) NULL,
  last_name   VARCHAR(100) NULL,
  phone       VARCHAR(30)  NULL,
  address     VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_profiles_user_id (user_id),   -- required by the upsert in userProfileModel
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS employees (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  FullName    VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NULL,
  phone       VARCHAR(30)  NULL,
  position    VARCHAR(100) NOT NULL,
  Department  VARCHAR(100) NOT NULL,
  salary      DECIMAL(12,2) NOT NULL DEFAULT 0,      -- monthly, GHS
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employees_email (email),
  KEY idx_employees_department (Department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  LogId         INT AUTO_INCREMENT PRIMARY KEY,
  UserId        INT NULL,
  actions       VARCHAR(100) NOT NULL,
  descriptions  VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_logs_created_at (created_at),
  KEY idx_audit_logs_user (UserId),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (UserId) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
