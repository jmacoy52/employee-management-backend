const db = require('./config/db');

console.log('WARNING: This will clear users, employees, audit logs, and notifications.');
console.log('Use this only for testing the setup flow.');

const resetQuery = `
  SET FOREIGN_KEY_CHECKS = 0;
  DELETE FROM notifications;
  DELETE FROM audit_logs;
  DELETE FROM employees;
  DELETE FROM users;
  SET FOREIGN_KEY_CHECKS = 1;
`;

db.query(resetQuery, (err) => {
  if (err) {
    console.error('Error clearing tenant data:', err);
    process.exit(1);
  }

  console.log('Tenant data cleared successfully.');
  console.log('System is now ready for setup testing.');
  db.end();
  process.exit(0);
});
