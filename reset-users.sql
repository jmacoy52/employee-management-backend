-- Reset Users Script - Clears all users and resets system
-- WARNING: This will delete ALL user data and reset the system

-- Disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Clear audit logs first (due to foreign key constraint)
DELETE FROM audit_logs;

-- Clear all users
DELETE FROM users;

-- Reset auto-increment counters
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE audit_logs AUTO_INCREMENT = 1;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Clear any system initialization flags (if exists)
-- Note: You may need to add a system_settings table for this

SELECT 'Users table has been reset successfully' as message;
