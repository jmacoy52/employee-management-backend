const db = require('./config/db');

const createNotificationsTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      organization_id VARCHAR(64) NULL,
      user_id INT NULL,
      type ENUM('success', 'warning', 'info', 'error') NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      icon VARCHAR(50) DEFAULT 'Bell',
      color VARCHAR(50) DEFAULT 'text-blue-500',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_organization_id (organization_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  db.query(query, (err) => {
    if (err) {
      console.error('Error creating notifications table:', err);
      process.exit(1);
    }

    console.log('Notifications table created successfully.');
    db.end();
    process.exit(0);
  });
};

createNotificationsTable();
