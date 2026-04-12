const db = require('../config/db');

class NotificationModel {
  // Get all notifications for a user
  static getNotificationsByUserId(userId, callback) {
    const query = `
      SELECT * FROM notifications 
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY created_at DESC
    `;
    db.query(query, [userId], callback);
  }

  // Create a new notification
  static createNotification(notificationData, callback) {
    const query = `
      INSERT INTO notifications (user_id, type, title, message, icon, color, read)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      notificationData.user_id || null,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.icon || 'Bell',
      notificationData.color || 'text-blue-500',
      notificationData.read || false
    ];
    db.query(query, values, callback);
  }

  // Mark notification as read
  static markAsRead(notificationId, callback) {
    const query = 'UPDATE notifications SET \`read\` = true WHERE id = ?';
    db.query(query, [notificationId], callback);
  }

  // Mark all notifications as read for a user
  static markAllAsRead(userId, callback) {
    const query = 'UPDATE notifications SET \`read\` = true WHERE user_id = ? OR user_id IS NULL';
    db.query(query, [userId], callback);
  }

  // Delete notification
  static deleteNotification(notificationId, callback) {
    const query = 'DELETE FROM notifications WHERE id = ?';
    db.query(query, [notificationId], callback);
  }

  // Clear all notifications for a user
  static clearAllNotifications(userId, callback) {
    const query = 'DELETE FROM notifications WHERE user_id = ? OR user_id IS NULL';
    db.query(query, [userId], callback);
  }

  // Get unread count for a user
  static getUnreadCount(userId, callback) {
    const query = `
      SELECT COUNT(*) as count FROM notifications 
      WHERE (user_id = ? OR user_id IS NULL) AND \`read\` = false
    `;
    db.query(query, [userId], callback);
  }

  // Create system notification (for all users)
  static createSystemNotification(notificationData, callback) {
    const query = `
      INSERT INTO notifications (user_id, type, title, message, icon, color, read)
      VALUES (NULL, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.icon || 'Bell',
      notificationData.color || 'text-blue-500',
      false
    ];
    db.query(query, values, callback);
  }
}

module.exports = NotificationModel;
