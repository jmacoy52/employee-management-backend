-- Database Schema Updates for Employee Management System

-- Add security fields to users table for account locking
ALTER TABLE users
ADD COLUMN failed_login_attempts INT DEFAULT 0,
ADD COLUMN account_locked BOOLEAN DEFAULT FALSE;

-- Optional: Add index on email for faster lookups
CREATE INDEX idx_users_email ON users(email);

-- Optional: Add index on role for role-based queries
CREATE INDEX idx_users_role ON users(role);

-- Audit logs table (if not already created)
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  entity_id INT,
  before_value JSON,
  after_value JSON,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Index on audit logs for performance
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Employees table (if not already created)
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  FullName VARCHAR(255) NOT NULL,
  position VARCHAR(255),
  Department VARCHAR(255),
  salary DECIMAL(10,2),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Index on employees
CREATE INDEX idx_employees_email ON employees(email);
CREATE INDEX idx_employees_department ON employees(Department);