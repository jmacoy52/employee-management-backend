import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { 
  Users, 
  Shield, 
  UserCheck, 
  Activity,
  TrendingUp,
  Clock,
  Calendar,
  AlertTriangle,
  ScrollText
} from "lucide-react";
import "./DashboardOverview.css";

const DashboardOverview = ({ showActions = true }) => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminUsers: 0,
    hrUsers: 0,
    employeeUsers: 0,
    superAdminUsers: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No authentication token found");
        setLoading(false);
        return;
      }

      // Fetch user statistics
      const statsResponse = await axios.get("http://localhost:5000/api/users/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Fetch recent activity (audit logs)
      const activityResponse = await axios.get("http://localhost:5000/api/admin/audit-logs", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStats(statsResponse.data);
      setRecentActivity(activityResponse.data.slice(0, 5)); // Get last 5 activities
      setLoading(false);
      setError("");
    } catch (err) {
      console.error("Dashboard data fetch error:", err);
      const errorMessage = err.response?.data?.error || err.message || "Failed to fetch dashboard data";
      setError(errorMessage);
      setLoading(false);
      toast.error(errorMessage);
    }
  };

  const statCards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      color: "#3b82f6",
      trend: "Active",
      trendColor: "#10b981"
    },
    {
      title: "Super Admins",
      value: stats.superAdminUsers,
      icon: Shield,
      color: "#dc2626",
      trend: "System Admins",
      trendColor: "#64748b"
    },
    {
      title: "Admin Users",
      value: stats.adminUsers,
      icon: Shield,
      color: "#8b5cf6",
      trend: "Administrators",
      trendColor: "#64748b"
    },
    {
      title: "HR Users",
      value: stats.hrUsers,
      icon: UserCheck,
      color: "#10b981",
      trend: "Employee Managers",
      trendColor: "#64748b"
    },
    {
      title: "Employee Users",
      value: stats.employeeUsers,
      icon: Users,
      color: "#f59e0b",
      trend: "Self-Service",
      trendColor: "#64748b"
    }
  ];

  if (loading) {
    return (
      <div className="dashboard-overview">
        <div className="overview-loading">
          <Activity className="spinner" size={32} />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-overview">
      {/* Statistics Grid */}
      <div className="stats-section">
        <h2 className="section-title">System Overview</h2>
        <div className="stats-grid">
          {statCards.map((stat, index) => (
            <div key={index} className="stat-card">
              <div 
                className="stat-icon" 
                style={{ background: stat.color }}
              >
                <stat.icon size={24} color="white" />
              </div>
              <div className="stat-content">
                <h3 className="stat-number">{stat.value}</h3>
                <p className="stat-label">{stat.title}</p>
                <div className="stat-trend" style={{ color: stat.trendColor }}>
                  <TrendingUp size={14} />
                  <span>{stat.trend}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="activity-section">
        <h2 className="section-title">Recent Activity</h2>
        <div className="activity-list">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-icon">
                  <Activity size={16} />
                </div>
                <div className="activity-content">
                  <p className="activity-description">{activity.description}</p>
                  <div className="activity-meta">
                    <span className="activity-user">{activity.username || `User ${activity.user_id}`}</span>
                    <span className="activity-time">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-activity">
              <Clock size={32} />
              <p>No recent activity</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      {showActions && (
        <div className="actions-section">
          <h2 className="section-title">Quick Actions</h2>
          <div className="actions-grid">
            <div className="action-card">
              <div className="action-icon">
                <Users size={24} />
              </div>
              <div className="action-content">
                <h3>View All Users</h3>
                <p>Browse and manage system users</p>
              </div>
            </div>
            <div className="action-card">
              <div className="action-icon">
                <Shield size={24} />
              </div>
              <div className="action-content">
                <h3>User Management</h3>
                <p>Create and manage user accounts</p>
              </div>
            </div>
            <div className="action-card">
              <div className="action-icon">
                <ScrollText size={24} />
              </div>
              <div className="action-content">
                <h3>Audit Log</h3>
                <p>Review system activity</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default DashboardOverview;
