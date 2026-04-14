import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { Users, FileText, BarChart3, Settings, Menu, X, Search, Bell } from 'lucide-react';
import NotificationBell from '../NotificationBell';
import './HRLayout.css';

const HRLayout = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, path: '/hr/dashboard' },
    { id: 'employees', label: 'Employees', icon: Users, path: '/hr/employees' },
    { id: 'departments', label: 'Departments', icon: FileText, path: '/hr/departments' },
    { id: 'reports', label: 'Reports', icon: BarChart3, path: '/hr/reports' },
    { id: 'profile', label: 'My Profile', icon: Settings, path: '/hr/profile' },
    { id: 'notifications', label: 'Notifications', icon: Bell, path: '/hr/notifications' }
  ];

  return (
    <div className="hr-layout">
      {/* Sidebar */}
      <div className={`hr-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="hr-sidebar-header">
          <h1 className="hr-sidebar-title">EmploCore HR</h1>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hr-sidebar-toggle"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        <nav className="hr-sidebar-nav">
          <ul className="hr-sidebar-nav-list">
            {menuItems.map((item) => (
              <li key={item.id} className="hr-sidebar-nav-item">
                <Link
                  to={item.path}
                  className={`hr-sidebar-nav-link ${
                    location.pathname === item.path ? 'active' : ''
                  }`}
                >
                  <item.icon size={20} className="hr-sidebar-nav-icon" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Main Content */}
      <div className={`hr-main-content ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        {/* Top Bar */}
        <header className="hr-topbar">
          <div className="hr-topbar-content">
            <div className="hr-search-container">
              <Search size={20} className="hr-search-icon" />
              <input
                type="text"
                placeholder="Search employees, departments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="hr-search-input"
              />
            </div>

            <div className="hr-topbar-actions">
              {/* Notifications */}
              <NotificationBell
                targetPath="/hr/notifications"
                className="hr-notification-button"
                badgeClassName="hr-notification-badge"
              />

              {/* User Menu */}
              <div className="hr-user-menu">
                <button className="hr-user-avatar">
                  {(user?.username || user?.email?.charAt(0) || 'U').charAt(0).toUpperCase()}
                </button>
                <div className="hr-user-info">
                  <p className="hr-user-name">{user?.username || user?.email?.split('@')[0]}</p>
                  <p className="hr-user-role">{user?.role?.replace('_', ' ') || 'Team User'}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="hr-page-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default HRLayout;
