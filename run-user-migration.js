const db = require('./config/db');
const fs = require('fs');

console.log('Running user management fields migration...');

// Read the SQL file
const sqlFile = fs.readFileSync('./add-user-management-fields.sql', 'utf8');

// Split into individual statements
const statements = sqlFile
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

async function runMigration() {
  try {
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 100) + '...');
      
      await new Promise((resolve, reject) => {
        db.query(statement, (err, result) => {
          if (err) {
            console.error('Error executing statement:', err);
            reject(err);
          } else {
            console.log('Success!');
            resolve(result);
          }
        });
      });
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
