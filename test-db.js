// Simple database test
const db = require('./config/db');

console.log('Testing database connection...');

// Test 1: Check if users table exists
db.query('SHOW TABLES LIKE "users"', (err, results) => {
  if (err) {
    console.error('Error checking users table:', err);
    return;
  }
  
  if (results.length === 0) {
    console.log('❌ Users table does not exist');
  } else {
    console.log('✅ Users table exists');
  }
});

// Test 2: Try to fetch users
db.query('SELECT COUNT(*) as count FROM users', (err, results) => {
  if (err) {
    console.error('Error counting users:', err);
    return;
  }
  
  console.log(`✅ Users table accessible. Found ${results[0].count} users`);
});

// Test 3: Try to fetch all users (same query as in controller)
db.query('SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 5', (err, results) => {
  if (err) {
    console.error('Error fetching users:', err);
    return;
  }
  
  console.log('✅ Sample users query successful:');
  console.log(JSON.stringify(results, null, 2));
});

// Close connection after tests
setTimeout(() => {
  db.end();
  console.log('Database connection closed');
}, 2000);
