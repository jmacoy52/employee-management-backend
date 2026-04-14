const db = require('../config/db');

class NotificationModel {
  // Get all notifications for a user
  static getNotificationsByUserId(organizationId, userId, callback) {
    const query = `
      SELECT * FROM notifications 
      WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL)
      ORDER BY created_at DESC
    `;
    db.query(query, [organizationId, userId], callback);
  }

  // Create a new notification
  static createNotification(notificationData, callback) {
    const query = `
      INSERT INTO notifications (organization_id, user_id, type, title, message, icon, color, read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      notificationData.organization_id || null,
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
  static markAsRead(organizationId, notificationId, callback) {
    const query = 'UPDATE notifications SET `read` = true WHERE id = ? AND organization_id = ?';
    db.query(query, [notificationId, organizationId], callback);
  }

  // Mark all notifications as read for a user
  static markAllAsRead(organizationId, userId, callback) {
    const query = 'UPDATE notifications SET `read` = true WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL)';
    db.query(query, [organizationId, userId], callback);
  }

  // Delete notification
  static deleteNotification(organizationId, notificationId, callback) {
    const query = 'DELETE FROM notifications WHERE id = ? AND organization_id = ?';
    db.query(query, [notificationId, organizationId], callback);
  }

  // Clear all notifications for a user
  static clearAllNotifications(organizationId, userId, callback) {
    const query = 'DELETE FROM notifications WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL)';
    db.query(query, [organizationId, userId], callback);
  }

  // Get unread count for a user
  static getUnreadCount(organizationId, userId, callback) {
    const query = `
      SELECT COUNT(*) as count FROM notifications 
      WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL) AND \`read\` = false
    `;
    db.query(query, [organizationId, userId], callback);
  }

  // Create system notification (for all users)
  static createSystemNotification(notificationData, callback) {
    const query = `
      INSERT INTO notifications (organization_id, user_id, type, title, message, icon, color, read)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      notificationData.organization_id || null,
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
