import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { User, Calendar, Clock, DollarSign, Coffee, Bell, Settings, LogOut } from 'lucide-react';
import Card from '../../../common/ui/Card';
import Button from '../../../common/ui/Button';

const EmployeeDashboard = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'info',
      message: 'Your time sheet for this week is ready for review',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read: false
    },
    {
      id: 2,
      type: 'warning',
      message: 'Upcoming deadline: Project report due Friday',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      read: false
    }
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const markNotificationAsRead = (id) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, read: true } : notif
      )
    );
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue' }) => (
    <Card className="p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${color === 'green' ? 'bg-green-100' : color === 'yellow' ? 'bg-yellow-100' : 'bg-blue-100'}`}>
          <Icon size={24} className={color === 'green' ? 'text-green-600' : color === 'yellow' ? 'text-yellow-600' : 'text-blue-600'} />
        </div>
        <div className="ml-4">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-600">{subtitle}</p>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-4xl w-full p-6">
        {/* Welcome Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.username}</p>
          <p className="text-sm text-gray-500 mb-4">Current Time: {currentTime}</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={Clock}
            title="Hours This Week"
            value="40"
            subtitle="8 hours/day"
            color="green"
          />
          <StatCard
            icon={Calendar}
            title="Days Off This Month"
            value="2"
            subtitle="Remaining: 8 days"
            color="blue"
          />
          <StatCard
            icon={DollarSign}
            title="Monthly Salary"
            value="₵4,500"
            subtitle="Gross pay"
            color="yellow"
          />
          <StatCard
            icon={Coffee}
            title="Break Time"
            value="15 min"
            subtitle="Next break at 2:30 PM"
            color="purple"
          />
        </div>

        {/* Notifications */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Bell size={20} className="mr-2" />
            Notifications
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                {notifications.filter(n => !n.read).length}
              </span>
            )}
          </h3>
          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bell size={48} className="mx-auto mb-4 text-gray-400" />
                <p>No notifications</p>
              </div>
            ) : (
              notifications.slice(0, 5).map(notification => (
                <div 
                  key={notification.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                    notification.read ? 'bg-white border-gray-200' : 'bg-blue-50 border-blue-200'
                  }`}
                  onClick={() => markNotificationAsRead(notification.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start">
                      <div className={`w-2 h-2 rounded-full mr-3 ${
                        notification.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(notification.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {!notification.read && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                          New
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button className="w-full">
              Request Time Off
            </Button>
            <Button className="w-full" variant="secondary">
              View Schedule
            </Button>
            <Button className="w-full" variant="secondary">
              Update Profile
            </Button>
          </div>
        </Card>

        {/* Team Members */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members</h3>
          <div className="space-y-3">
            {['Alice Johnson - Project Manager', 'Bob Smith - Senior Developer', 'Carol Davis - UX Designer', 'David Wilson - Backend Engineer'].map((member, index) => (
              <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-700">
                      {Member.split(' - ')[0].split(' ').map(n => n[0]).toUpperCase()}
                    </span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">{Member}</p>
                    <p className="text-xs text-gray-500">Engineering Department</p>
                  </div>
                </div>
                <div className="text-green-500 text-sm">
                  Online
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
