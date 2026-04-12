const db = require('./config/db');

// Create notifications table
const createNotificationsTable = () => {
  const query = `
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      type ENUM('success', 'warning', 'info', 'error') NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      icon VARCHAR(50) DEFAULT 'Bell',
      color VARCHAR(50) DEFAULT 'text-blue-500',
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  
  db.query(query, (err, result) => {
    if (err) {
      console.error('Error creating notifications table:', err);
      return;
    }
    
    console.log('Notifications table created successfully!');
    
    // Add some sample notifications
    const sampleNotifications = [
      [37, 'info', 'Welcome!', 'Welcome to the HR Dashboard', 'Bell', 'text-blue-500', false],
      [null, 'success', 'System Update', 'Employee management system is now online', 'CheckCircle', 'text-green-500', false],
      [null, 'warning', 'Reminder', 'Please update your profile information', 'AlertCircle', 'text-yellow-500', false]
    ];
    
    const insertQuery = `
      INSERT INTO notifications (user_id, type, title, message, icon, color, read) 
      VALUES ?
    `;
    
    db.query(insertQuery, [sampleNotifications], (err, result) => {
      if (err) {
        console.error('Error inserting sample notifications:', err);
      } else {
        console.log('Sample notifications added successfully!');
      }
      process.exit(0);
    });
  });
};

createNotificationsTable();
