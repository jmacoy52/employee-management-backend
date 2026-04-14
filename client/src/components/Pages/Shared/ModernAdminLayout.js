import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Home, 
  Users, 
  FileText, 
  UserCheck, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  Shield,
  Settings
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import NotificationBell from "../../common/NotificationBell";
import "./ModernAdminLayout.css";

const ModernAdminLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigation = [
    {
      name: "Dashboard",
      path: "/admin/dashboard",
      icon: Home,
      description: "System overview and analytics"
    },
    {
      name: "User Management",
      path: "/admin/users",
      icon: Users,
      description: "Create and manage user accounts"
    },
    {
      name: "Audit Log",
      path: "/admin/auditlog",
      icon: FileText,
      description: "System activity and changes"
    },
    {
      name: "Notifications",
      path: "/admin/notifications",
      icon: Settings,
      description: "Tenant alerts and activity"
    },
    {
      name: "HR Dashboard",
      path: "/hr/dashboard",
      icon: UserCheck,
      description: "HR functionalities"
    }
  ];

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="modern-admin">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <Shield />
            </div>
            {!sidebarCollapsed && (
              <div className="logo-text">
                <h1>EmploCore</h1>
                <span>Admin Portal</span>
              </div>
            )}
          </div>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>Main</h3>
            <ul className="nav-list">
              {navigation.map((item) => (
                <li key={item.name}>
                  <button
                    className={`nav-button ${isActive(item.path) ? 'active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon className="nav-icon" />
                    {!sidebarCollapsed && (
                      <div className="nav-content">
                        <span className="nav-name">{item.name}</span>
                        <span className="nav-description">{item.description}</span>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {(user?.username || user?.email?.charAt(0) || 'A').charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <div className="user-info">
                <div className="user-name">{user?.username || user?.email?.split('@')[0] || 'Admin'}</div>
                <div className="user-role">{user?.role === 'super_admin' ? 'Super Admin' : 'Administrator'}</div>
              </div>
            )}
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <LogOut className="logout-icon" />
            {!sidebarCollapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
        <header className="main-header">
          <div className="header-content">
            <div className="header-left">
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
            <div className="header-right">
              <NotificationBell
                targetPath="/admin/notifications"
                className="admin-notification-button"
                badgeClassName="admin-notification-badge"
              />
              <div className="breadcrumb">
                <span>Admin</span>
                <ChevronRight className="breadcrumb-separator" />
                <span className="breadcrumb-current">
                  {navigation.find(item => isActive(item.path))?.name || 'Dashboard'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
};

export default ModernAdminLayout;
