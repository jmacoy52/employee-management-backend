import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { Users, Calendar, TrendingUp, Clock, AlertCircle, Activity, DollarSign, UserCheck } from 'lucide-react';
import Card from '../../../common/ui/Card';
import Button from '../../../common/ui/Button';

const HRDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeToday: 0,
    newThisMonth: 0,
    departments: 0,
    pendingApprovals: 0,
    avgSalary: 0
  });
  const [loading, setLoading] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    loadHRDashboardData();
  }, []);

  const loadHRDashboardData = async () => {
    setLoading(true);
    try {
      // Mock HR stats for now
      const mockStats = {
        totalEmployees: 156,
        activeToday: 142,
        newThisMonth: 8,
        departments: 12,
        pendingApprovals: 3,
        avgSalary: 45000
      };
      
      setStats(mockStats);
      
      // Use WebSocket notifications instead of mock activity
      setRecentActivity(notifications);
    } catch (error) {
      console.error('Failed to load HR dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue', trend = null }) => (
    <Card className="p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${color === 'green' ? 'bg-green-100' : color === 'yellow' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
          <Icon size={24} className={color === 'green' ? 'text-green-600' : color === 'yellow' ? 'text-yellow-600' : 'text-blue-600'} />
        </div>
        <div className="ml-4">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-600">{subtitle}</p>
          {trend && (
            <div className="flex items-center mt-2">
              <trend.icon size={16} className={trend.color} />
              <span className="text-sm text-gray-500">{trend.text}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  const ActivityItem = ({ activity }) => {
    const getIcon = () => {
      switch (activity.type) {
        case 'employee_added': return <Users size={16} className="text-green-500" />;
        case 'leave_request': return <Calendar size={16} className="text-yellow-500" />;
        case 'department_created': return <Activity size={16} className="text-blue-500" />;
        default: return <Clock size={16} className="text-gray-500" />;
      }
    };

    const getTimeAgo = (timestamp) => {
      const now = new Date();
      const past = new Date(timestamp);
      const diffInSeconds = Math.floor((now - past) / 1000);
      
      if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">HR Dashboard</h1>
        <p className="text-gray-600">Welcome back, {user?.username}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={Users}
          title="Total Employees"
          value={stats.totalEmployees}
          subtitle="Registered in system"
          color="blue"
        />
        <StatCard
          icon={Activity}
          title="Active Today"
          value={stats.activeToday}
          subtitle="Currently working"
          color="green"
          trend={{ icon: TrendingUp, color: 'text-green-500', text: '+12% from last month' }}
        />
        <StatCard
          icon={UserCheck}
          title="Pending Approvals"
          value={stats.pendingApprovals}
          subtitle="Awaiting review"
          color="yellow"
        />
        <StatCard
          icon={DollarSign}
          title="Avg Salary"
          value={`₵${stats.avgSalary.toLocaleString()}`}
          subtitle="Per employee"
          color="green"
        />
        <StatCard
          icon={Activity}
          title="Departments"
          value={stats.departments}
          subtitle="Active departments"
          color="blue"
        />
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Department Distribution Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Activity size={20} className="mr-2" />
            Department Distribution
          </h3>
          <div className="h-48 flex items-center justify-center text-gray-500">
            <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
            <p>Chart component coming soon...</p>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Clock size={20} className="mr-2" />
            Recent Activity
          </h3>
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 border-t-transparent"></div>
                <span className="ml-2">Loading activity...</span>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                <p>No recent activity</p>
              </div>
            ) : (
              recentActivity.slice(0, 5).map(activity => (
                <div key={activity.id} className="flex items-start justify-between p-4 border-b border-gray-200 last:border-0">
                  <div className="flex items-start">
                    {getIcon()}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">{activity.user}</p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {getTimeAgo(activity.timestamp)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default HRDashboard;
