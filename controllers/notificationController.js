const NotificationModel = require('../models/notificationModel');

class NotificationController {
  // Get all notifications for a user
  static getNotifications(req, res) {
    const userId = req.user.id;
    const organizationId = req.user.organization_id;
    
    NotificationModel.getNotificationsByUserId(organizationId, userId, (err, notifications) => {
      if (err) {
        console.error('Error fetching notifications:', err);
        // Don't return error for empty result - it's normal
        if (err.code === 'ER_NO_SUCH_TABLE') {
          return res.json([]); // Return empty array if table doesn't exist
        }
        return res.status(500).json({ error: 'Failed to fetch notifications' });
      }

      // Format notifications for frontend
      const formattedNotifications = notifications.map(notification => {
        const timeAgo = this.getTimeAgo(notification.created_at);
        return {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          time: timeAgo,
          read: notification.read,
          icon: notification.icon || 'Bell',
          color: notification.color
        };
      });

      res.status(200).json(formattedNotifications);
    });
  }

  // Mark notification as read
  static markAsRead(req, res) {
    const notificationId = req.params.id;
    const organizationId = req.user.organization_id;
    
    NotificationModel.markAsRead(organizationId, notificationId, (err, result) => {
      if (err) {
        console.error('Error marking notification as read:', err);
        return res.status(500).json({ error: 'Failed to mark notification as read' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      res.status(200).json({ message: 'Notification marked as read' });
    });
  }

  // Mark all notifications as read
  static markAllAsRead(req, res) {
    const userId = req.user.id;
    const organizationId = req.user.organization_id;
    
    NotificationModel.markAllAsRead(organizationId, userId, (err, result) => {
      if (err) {
        console.error('Error marking all notifications as read:', err);
        return res.status(500).json({ error: 'Failed to mark all notifications as read' });
      }

      res.status(200).json({ message: 'All notifications marked as read' });
    });
  }

  // Delete notification
  static deleteNotification(req, res) {
    const notificationId = req.params.id;
    const organizationId = req.user.organization_id;
    
    NotificationModel.deleteNotification(organizationId, notificationId, (err, result) => {
      if (err) {
        console.error('Error deleting notification:', err);
        return res.status(500).json({ error: 'Failed to delete notification' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      res.status(200).json({ message: 'Notification deleted' });
    });
  }

  // Clear all notifications
  static clearAllNotifications(req, res) {
    const userId = req.user.id;
    const organizationId = req.user.organization_id;
    
    NotificationModel.clearAllNotifications(organizationId, userId, (err, result) => {
      if (err) {
        console.error('Error clearing notifications:', err);
        return res.status(500).json({ error: 'Failed to clear notifications' });
      }

      res.status(200).json({ message: 'All notifications cleared' });
    });
  }

  // Get unread count
  static async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      
      NotificationModel.getUnreadCount(req.user.organization_id, userId, (err, results) => {
        if (err) {
          console.error('Error fetching unread count:', err);
          // Don't return error for empty result - it's normal
          if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.json({ count: 0 }); // Return 0 if table doesn't exist
          }
          return res.status(500).json({ error: 'Failed to fetch unread count' });
        }
        
        res.json({ count: results[0].count });
      });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  }

  // Helper method to get time ago string
  static getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
      }
    }

    return 'Just now';
  }

  // Helper method to get icon component name
  static getIconComponent(iconName) {
    const iconMap = {
      'CheckCircle': 'CheckCircle',
      'AlertCircle': 'AlertCircle',
      'Calendar': 'Calendar',
      'XCircle': 'XCircle',
      'Bell': 'Bell',
      'User': 'User',
      'Settings': 'Settings',
      'Mail': 'Mail',
      'Shield': 'Shield',
      'Database': 'Database'
    };

    return iconMap[iconName] || 'Bell';
  }

  // Create notification (for system events)
  static createSystemNotification(req, res) {
    const { type, title, message, icon, color } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({ error: 'Type, title, and message are required' });
    }

    const notificationData = {
      organization_id: req.user.organization_id,
      type,
      title,
      message,
      icon: icon || 'Bell',
      color: color || 'text-blue-500'
    };

    NotificationModel.createSystemNotification(notificationData, (err, result) => {
      if (err) {
        console.error('Error creating system notification:', err);
        return res.status(500).json({ error: 'Failed to create notification' });
      }

      res.status(201).json({ message: 'System notification created', id: result.insertId });
    });
  }
}

module.exports = NotificationController;
