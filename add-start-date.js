require('dotenv').config({ path: __dirname + '/.env' });
const mysql = require('mysql2/promise');

async function addStartDateColumn() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'employee_management'
    });

    console.log('Adding start_date column to employees table...');
    
    // Add the column
    await connection.execute('ALTER TABLE employees ADD COLUMN start_date DATE');
    console.log('✅ start_date column added successfully');
    
    // Update existing records
    await connection.execute('UPDATE employees SET start_date = CURDATE() WHERE start_date IS NULL');
    console.log('✅ Existing records updated with current date');
    
    await connection.end();
    console.log('✅ Migration completed successfully');
    
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('✅ start_date column already exists');
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
}

addStartDateColumn();
