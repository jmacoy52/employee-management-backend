const db = require('./config/db');

console.log('Adding user management fields to users table...');

const alterTableQuery = `
  ALTER TABLE users 
  ADD COLUMN firstName VARCHAR(100) NULL,
  ADD COLUMN lastName VARCHAR(100) NULL,
  ADD COLUMN department VARCHAR(100) NULL,
  ADD COLUMN position VARCHAR(100) NULL,
  ADD COLUMN isTemporaryPassword BOOLEAN DEFAULT FALSE,
  ADD COLUMN failed_login_attempts INT DEFAULT 0,
  ADD COLUMN account_locked BOOLEAN DEFAULT FALSE
`;

db.query(alterTableQuery, (err, result) => {
  if (err) {
    console.error('Error adding columns:', err);
    process.exit(1);
  }
  
  console.log('Columns added successfully!');
  
  // Add indexes
  const indexQueries = [
    'CREATE INDEX idx_users_department ON users(department)',
    'CREATE INDEX idx_users_position ON users(position)',
    'CREATE INDEX idx_users_temp_password ON users(isTemporaryPassword)',
    'CREATE INDEX idx_users_email ON users(email)',
    'CREATE INDEX idx_users_role ON users(role)'
  ];
  
  let completed = 0;
  indexQueries.forEach((query, index) => {
    db.query(query, (err, result) => {
      if (err && err.code !== 'ER_KEY_COLUMN_DOES_NOT_EXITS') {
        console.error(`Error creating index ${index + 1}:`, err);
      } else {
        console.log(`Index ${index + 1} created successfully!`);
      }
      
      completed++;
      if (completed === indexQueries.length) {
        console.log('Migration completed successfully!');
        process.exit(0);
      }
    });
  });
});
