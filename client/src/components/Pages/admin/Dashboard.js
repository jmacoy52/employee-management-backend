import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { Users, Settings, TrendingUp, Activity, Database, Shield } from 'lucide-react';
import Card from '../../common/ui/Card';
import './Dashboard.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalEmployees: 0,
    departments: 0,
    systemHealth: 'good'
  });
  const [loading, setLoading] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Mock data for now
      const mockStats = {
        totalUsers: 156,
        activeUsers: 142,
        totalEmployees: 156,
        departments: 12
      };
      
      setStats(mockStats);
      
      // Mock recent activity
      setRecentActivity([
        {
          id: 1,
          type: 'user_registration',
          message: 'New user registered: John Doe',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          icon: Users
        },
        {
          id: 2,
          type: 'system_update',
          message: 'System performance optimized',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          icon: TrendingUp
        }
      ]);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue' }) => {
    return (
      <Card className="stat-card">
        <div className="stat-card-content">
          <div className={`stat-card-icon stat-card-icon-${color}`}>
            <Icon size={24} />
          </div>
          <div className="stat-card-info">
            <h3 className="stat-card-title">{title}</h3>
            <p className="stat-card-value">{value}</p>
            <p className="stat-card-subtitle">{subtitle}</p>
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-content">
          <div className="spinner"></div>
          <p className="loading-text">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Test element to verify rendering */}
      <div className="test-banner">
        AdminDashboard is rendering! User: {user?.name || 'Admin'}
      </div>
      
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Admin Dashboard</h1>
          <p className="dashboard-subtitle">Welcome back, {user?.name || 'Admin'}!</p>
        </div>

        <div className="stats-grid">
          <StatCard
            icon={Users}
            title="Total Users"
            value={stats.totalUsers}
            subtitle="Registered users"
            color="blue"
          />
          <StatCard
            icon={Activity}
            title="Active Users"
            value={stats.activeUsers}
            subtitle="Currently active"
            color="green"
          />
          <StatCard
            icon={Database}
            title="Total Employees"
            value={stats.totalEmployees}
            subtitle="In system"
            color="purple"
          />
          <StatCard
            icon={Settings}
            title="Departments"
            value={stats.departments}
            subtitle="Active departments"
            color="yellow"
          />
        </div>

        <div className="dashboard-grid">
          <Card className="system-health-card">
            <h2 className="card-title">System Health</h2>
            <div className="system-health-content">
              <Shield className={`health-icon ${stats.systemHealth === 'good' ? 'health-good' : 'health-bad'}`} />
              <div className="health-info">
                <p className="health-status">
                  Status: <span className={stats.systemHealth === 'good' ? 'status-good' : 'status-bad'}>
                    {stats.systemHealth === 'good' ? 'Good' : 'Issues'}
                  </span>
                </p>
                <p className="health-message">All systems operational</p>
              </div>
            </div>
          </Card>

          <Card className="recent-activity-card">
            <h3 className="card-title">Recent Activity</h3>
            <div className="activity-list">
              {recentActivity.map((activity) => {
                return (
                  <div key={activity.id} className="activity-item">
                    <activity.icon className="activity-icon" />
                    <div className="activity-content">
                      <p className="activity-message">{activity.message}</p>
                      <p className="activity-timestamp">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
