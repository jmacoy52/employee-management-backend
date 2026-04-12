-- Add user management fields to support admin user creation
-- Run this script to update the users table with additional fields

ALTER TABLE users 
ADD COLUMN firstName VARCHAR(100) NULL,
ADD COLUMN lastName VARCHAR(100) NULL,
ADD COLUMN department VARCHAR(100) NULL,
ADD COLUMN position VARCHAR(100) NULL,
ADD COLUMN isTemporaryPassword BOOLEAN DEFAULT FALSE;

-- Add indexes for better performance
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_position ON users(position);
CREATE INDEX idx_users_temp_password ON users(isTemporaryPassword);

-- Update existing users to have default values
UPDATE users SET 
  firstName = NULL,
  lastName = NULL,
  department = NULL,
  position = NULL,
  isTemporaryPassword = FALSE
WHERE firstName IS NULL OR lastName IS NULL;
