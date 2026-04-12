const db = require('./config/db');

// This script is for TESTING ONLY - it clears all users to test setup flow
console.log('⚠️  WARNING: This will clear all users from the database!');
console.log('⚠️  Use this ONLY for testing the setup flow!');

// Clear users table
const clearUsersQuery = 'DELETE FROM users';

db.query(clearUsersQuery, (err, result) => {
  if (err) {
    console.error('Error clearing users:', err);
    process.exit(1);
  }
  
  console.log('✅ Users table cleared successfully');
  console.log('📋 System is now ready for setup testing');
  console.log('🌐 Visit http://localhost:3000 to test setup flow');
  
  db.end();
  process.exit(0);
});
