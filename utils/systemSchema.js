const util = require('util');
const db = require('../config/db');

const queryAsync = util.promisify(db.query).bind(db);

async function initializeSystemSchema() {
  // Check if column exists before adding
  const columnExists = async (tableName, columnName) => {
    const result = await queryAsync(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = ? 
      AND COLUMN_NAME = ?
    `, [tableName, columnName]);
    return result[0].count > 0;
  };

  // Check if index exists
  const indexExists = async (indexName) => {
    const result = await queryAsync(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND INDEX_NAME = ?
    `, [indexName]);
    return result[0].count > 0;
  };

  // Create notifications table
  await queryAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id VARCHAR(64) NULL,
      user_id INT NULL,
      type ENUM('success', 'warning', 'info', 'error') NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      icon VARCHAR(50) DEFAULT 'Bell',
      color VARCHAR(50) DEFAULT 'text-blue-500',
      \`read\` BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_organization_id (organization_id),
      INDEX idx_notifications_user_id (user_id),
      CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`).catch(() => {});

  // Add columns only if they don't exist
  const tables = ['users', 'employees', 'audit_logs', 'notifications'];
  for (const table of tables) {
    if (!(await columnExists(table, 'organization_id'))) {
      await queryAsync(`ALTER TABLE ${table} ADD COLUMN organization_id VARCHAR(64) NULL`).catch(() => {});
    }
  }

  // Add updated_at column to users table if it doesn't exist
  if (!(await columnExists('users', 'updated_at'))) {
    await queryAsync(`ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`).catch(() => {});
  }

  // Create indexes only if they don't exist
  const indexes = [
    { name: 'idx_users_organization_id', table: 'users', column: 'organization_id' },
    { name: 'idx_employees_organization_id', table: 'employees', column: 'organization_id' },
    { name: 'idx_audit_logs_organization_id', table: 'audit_logs', column: 'organization_id' },
    { name: 'idx_notifications_organization_id', table: 'notifications', column: 'organization_id' }
  ];

  for (const index of indexes) {
    if (!(await indexExists(index.name))) {
      await queryAsync(`CREATE INDEX ${index.name} ON ${index.table}(${index.column})`).catch(() => {});
    }
  }

  await queryAsync(`
    UPDATE users
    SET organization_id = CONCAT('org_', id)
    WHERE organization_id IS NULL AND role = 'super_admin'
  `);

  await queryAsync(`
    UPDATE users u
    JOIN (
      SELECT organization_id
      FROM users
      WHERE role = 'super_admin' AND organization_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1
    ) t
    SET u.organization_id = t.organization_id
    WHERE u.organization_id IS NULL
  `).catch(() => {});

  await queryAsync(`
    UPDATE employees e
    JOIN (
      SELECT organization_id
      FROM users
      WHERE organization_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1
    ) t
    SET e.organization_id = t.organization_id
    WHERE e.organization_id IS NULL
  `).catch(() => {});

  await queryAsync(`
    UPDATE audit_logs a
    JOIN users u ON a.user_id = u.id
    SET a.organization_id = u.organization_id
    WHERE a.organization_id IS NULL
  `).catch(() => {});

  await queryAsync(`
    UPDATE notifications n
    JOIN users u ON n.user_id = u.id
    SET n.organization_id = u.organization_id
    WHERE n.organization_id IS NULL AND n.user_id IS NOT NULL
  `).catch(() => {});
}

module.exports = { initializeSystemSchema };
