const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Get all notifications for authenticated user
router.get('/', authenticateToken, NotificationController.getNotifications);

// Get unread count for authenticated user
router.get('/unread-count', authenticateToken, NotificationController.getUnreadCount);

// Mark notification as read
router.put('/:id/read', authenticateToken, NotificationController.markAsRead);

// Mark all notifications as read
router.put('/mark-all-read', authenticateToken, NotificationController.markAllAsRead);

// Delete notification
router.delete('/:id', authenticateToken, NotificationController.deleteNotification);

// Clear all notifications
router.delete('/', authenticateToken, NotificationController.clearAllNotifications);

// Create system notification (admin only)
router.post('/system', authenticateToken, NotificationController.createSystemNotification);

module.exports = router;
