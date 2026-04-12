-- Add profile_picture column to users table
ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;

-- Add indexes for profile picture
CREATE INDEX idx_users_profile_picture ON users(profile_picture);

-- Show the updated table structure
DESCRIBE users;
