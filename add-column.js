const db = require('./config/db');

// Add profile_picture column to users table
const addProfilePictureColumn = () => {
  // First check if column exists
  const checkQuery = `
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'employee_db' 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'profile_picture'
  `;
  
  db.query(checkQuery, (err, results) => {
    if (err) {
      console.error('Error checking column:', err);
      return;
    }
    
    if (results.length > 0) {
      console.log('Profile picture column already exists!');
      process.exit(0);
      return;
    }
    
    // Add the column if it doesn't exist
    const addQuery = `
      ALTER TABLE users 
      ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL
    `;
    
    db.query(addQuery, (err, result) => {
      if (err) {
        console.error('Error adding profile_picture column:', err);
        return;
      }
      
      console.log('Profile picture column added successfully!');
      process.exit(0);
    });
  });
};

addProfilePictureColumn();
