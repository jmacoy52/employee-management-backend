const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs').promises;

// Import database configuration
const db = require('./config/db');

// Get dbConfig from the exported db object
const dbConfig = db.config || {
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'employee_management'
};

async function resetSystem() {
  console.log('🔄 Starting EmploCore System Reset...');
  
  try {
    // Connect to database
    const connection = await mysql.createConnection(dbConfig);
    
    console.log('📊 Connected to database successfully');
    
    // Disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Clear all users
    console.log('🗑️ Deleting all users...');
    await connection.query('DELETE FROM users');
    
    // Clear all audit logs
    console.log('📋 Deleting all audit logs...');
    await connection.query('DELETE FROM audit_logs');
    
    // Clear all employees
    console.log('👥 Deleting all employees...');
    await connection.query('DELETE FROM employees');
    
    // Reset auto-increment counters
    console.log('🔄 Resetting auto-increment counters...');
    await connection.query('ALTER TABLE users AUTO_INCREMENT = 1');
    await connection.query('ALTER TABLE audit_logs AUTO_INCREMENT = 1');
    await connection.query('ALTER TABLE employees AUTO_INCREMENT = 1');
    
    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ System reset completed successfully!');
    console.log('🎯 System is now ready for fresh setup');
    console.log('🌐 Visit http://localhost:3000 to test setup flow');
    
    // Close connection
    await connection.end();
    
  } catch (error) {
    console.error('❌ Error during system reset:', error);
    process.exit(1);
  }
}

// Check if this file is being run directly
if (require.main === module) {
  resetSystem();
} else {
  console.log('⚠️  This script should be run with: node reset-system.js');
  console.log('🔧 It will delete all users and reset system to initial state');
}
