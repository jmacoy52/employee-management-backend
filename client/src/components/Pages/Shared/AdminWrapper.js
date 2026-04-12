import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Database, 
  Users, 
  Settings, 
  ScrollText, 
  UserCheck, 
  LogOut, 
  Shield,
  Menu,
  X
} from "lucide-react";
import "./AdminWrapper.css";

const AdminWrapper = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const menuItems = [
    {
      id: 'dashboard',
      path: '/AdminDashboard',
      label: 'Dashboard',
      icon: Database,
      description: 'System overview and statistics'
    },
    {
      id: 'users',
      path: '/admin/users',
      label: 'View Users',
      icon: Users,
      description: 'Browse and manage all users'
    },
    {
      id: 'usermanagement',
      path: '/admin/usermanagement',
      label: 'User Management',
      icon: Settings,
      description: 'Create, edit and manage user accounts'
    },
    {
      id: 'auditlog',
      path: '/admin/auditlog',
      label: 'Audit Log',
      icon: ScrollText,
      description: 'Review system activity and changes'
    },
    {
      id: 'hr',
      path: '/admin/hr',
      label: 'HR Dashboard',
      icon: UserCheck,
      description: 'HR functionalities and employee management'
    }
  ];

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="admin-wrapper">
      {/* SIDE PANEL */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="logo-section">
            <Shield className="logo-icon" />
            {!sidebarCollapsed && (
              <div className="logo-text">
                <h2 className="logo-title">EmploCore</h2>
                <p className="logo-subtitle">Admin Panel</p>
              </div>
            )}
          </div>
          <button 
            className="collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <ul className="nav-menu">
            {menuItems.map((item) => (
              <li 
                key={item.id}
                className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
                title={sidebarCollapsed ? item.label : ''}
              >
                <item.icon className="nav-icon" />
                {!sidebarCollapsed && (
                  <div className="nav-content">
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-description">{item.description}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {!sidebarCollapsed && (
            <div className="user-info">
              <div className="user-avatar">
                {localStorage.getItem('username')?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="user-details">
                <span className="user-name">{localStorage.getItem('username') || 'Admin'}</span>
                <span className="user-role">Administrator</span>
              </div>
            </div>
          )}
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut className="logout-icon" />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className={`admin-main ${sidebarCollapsed ? 'expanded' : ''}`}>
        <div className="main-header">
          <div className="header-content">
            <h1 className="page-title">{title}</h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
          <div className="header-actions">
            <div className="breadcrumb">
              <span className="breadcrumb-item">Admin</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-item active">
                {menuItems.find(item => isActive(item.path))?.label || 'Dashboard'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="main-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminWrapper;
