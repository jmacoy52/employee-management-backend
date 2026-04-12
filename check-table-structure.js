const db = require('./config/db');

console.log('Checking users table structure...');

const query = 'DESCRIBE users';

db.query(query, (err, results) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('Current users table structure:');
  results.forEach(column => {
    console.log(`${column.Field} - ${column.Type} - ${column.Null} - ${column.Key} - ${column.Default}`);
  });
  
  process.exit(0);
});
