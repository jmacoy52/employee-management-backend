const fs = require('fs');
const mysql = require('mysql2');
const path = require('path');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'employee_db',
  multipleStatements: true
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
  console.log('Connected to database');

  const sqlFile = path.join(__dirname, 'database-setup.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error executing SQL:', err);
      db.end();
      process.exit(1);
    }
    console.log('Database setup completed successfully');
    db.end();
  });
});