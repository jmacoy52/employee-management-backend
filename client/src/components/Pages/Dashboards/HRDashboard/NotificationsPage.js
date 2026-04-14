import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Clock,
  ChevronLeft,
  Trash2,
  Check,
  X
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../../contexts/AuthContext";
import { notificationAPI } from "../../../../services/apiService";
import "./NotificationsPage.css";
import toast from "react-hot-toast";

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const iconMap = {
    Bell,
    CheckCircle,
    XCircle,
    AlertCircle,
    Info
  };

  const isAdminView = location.pathname.startsWith("/admin");
  const dashboardPath = isAdminView ? "/admin/dashboard" : "/hr/dashboard";
  const subtitle = isAdminView
    ? "Tenant-wide alerts, onboarding updates, and system events"
    : "Stay updated with latest activities";

  // Fetch real notifications from API
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      try {
        const response = await notificationAPI.getNotifications();
        setNotifications(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching notifications:', error);
        toast.error('Failed to load notifications');
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [user]);

  const markAsRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications(notifications.map(notif => 
        notif.id === id ? { ...notif, read: true } : notif
      ));
      toast.success("Marked as read");
    } catch (error) {
      console.error('Error marking as read:', error);
      toast.error('Failed to mark as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(notifications.map(notif => ({ ...notif, read: true })));
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const deleteNotification = async (id) => {
    try {
      await notificationAPI.deleteNotification(id);
      setNotifications(notifications.filter(notif => notif.id !== id));
      toast.success("Notification deleted");
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const clearAllNotifications = async () => {
    try {
      await notificationAPI.clearAllNotifications();
      setNotifications([]);
      toast.success("All notifications cleared");
    } catch (error) {
      console.error('Error clearing notifications:', error);
      toast.error('Failed to clear notifications');
    }
  };

  const filteredNotifications = notifications.filter(notif => {
    if (filter === "all") return true;
    if (filter === "unread") return !notif.read;
    if (filter === "read") return notif.read;
    return true;
  });

  
  return (
    <div className="notifications-page">
      <div className="page-header">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={() => navigate(dashboardPath)}
          >
            <ChevronLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <div className="header-info">
            <h1 className="page-title">Notifications</h1>
            <p className="page-subtitle">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="notifications-container">
        <div className="notifications-sidebar">
          <div className="filter-section">
            <h3>Filter</h3>
            <div className="filter-options">
              <button
                className={`filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                <Bell size={16} />
                <span>All ({notifications.length})</span>
              </button>
              <button
                className={`filter-btn ${filter === "unread" ? "active" : ""}`}
                onClick={() => setFilter("unread")}
              >
                <Clock size={16} />
                <span>Unread ({notifications.filter(n => !n.read).length})</span>
              </button>
              <button
                className={`filter-btn ${filter === "read" ? "active" : ""}`}
                onClick={() => setFilter("read")}
              >
                <Check size={16} />
                <span>Read ({notifications.filter(n => n.read).length})</span>
              </button>
            </div>
          </div>

          <div className="actions-section">
            <h3>Actions</h3>
            <button
              className="action-btn"
              onClick={markAllAsRead}
              disabled={notifications.every(n => n.read)}
            >
              <Check size={16} />
              <span>Mark All as Read</span>
            </button>
            <button
              className="action-btn danger"
              onClick={clearAllNotifications}
              disabled={notifications.length === 0}
            >
              <Trash2 size={16} />
              <span>Clear All</span>
            </button>
          </div>
        </div>

        <div className="notifications-content">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="empty-state">
              <Bell size={48} className="text-gray-400" />
              <h3>No notifications</h3>
              <p>You're all caught up! Check back later for updates.</p>
            </div>
          ) : (
            <div className="notifications-list">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.read ? "unread" : ""}`}
                >
                  <div className="notification-icon">
                    {React.createElement(iconMap[notification.icon] || Bell, { size: 20 })}
                  </div>
                  <div className="notification-content">
                    <div className="notification-header">
                      <h4>{notification.title}</h4>
                      <span className="notification-time">{notification.time}</span>
                    </div>
                    <p className="notification-message">{notification.message}</p>
                  </div>
                  <div className="notification-actions">
                    {!notification.read && (
                      <button
                        className="action-icon-btn"
                        onClick={() => markAsRead(notification.id)}
                        title="Mark as read"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button
                      className="action-icon-btn danger"
                      onClick={() => deleteNotification(notification.id)}
                      title="Delete notification"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
