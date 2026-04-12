import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Home, 
  Users, 
  Settings, 
  FileText, 
  UserCheck, 
  LogOut, 
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Shield,
  Menu,
  X
} from "lucide-react";
import "./ModernAdminLayout.css";

const ModernAdminLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigation = [
    {
      name: "Dashboard",
      href: "/AdminDashboard",
      icon: Home,
      description: "System overview and analytics"
    },
    {
      name: "Users",
      href: "/admin/users",
      icon: Users,
      description: "View and manage all users"
    },
    {
      name: "User Management",
      href: "/admin/usermanagement",
      icon: Settings,
      description: "Create and edit user accounts"
    },
    {
      name: "Audit Log",
      href: "/admin/auditlog",
      icon: FileText,
      description: "System activity and changes"
    },
    {
      name: "HR Dashboard",
      href: "/admin/hr",
      icon: UserCheck,
      description: "HR functionalities"
    }
  ];

  const isActive = (href) => location.pathname === href;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
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
                    className={`nav-button ${isActive(item.href) ? 'active' : ''}`}
                    onClick={() => navigate(item.href)}
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
              {localStorage.getItem('username')?.charAt(0).toUpperCase() || 'A'}
            </div>
            {!sidebarCollapsed && (
              <div className="user-info">
                <div className="user-name">{localStorage.getItem('username') || 'Admin'}</div>
                <div className="user-role">Administrator</div>
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
              <div className="breadcrumb">
                <span>Admin</span>
                <ChevronRight className="breadcrumb-separator" />
                <span className="breadcrumb-current">
                  {navigation.find(item => isActive(item.href))?.name || 'Dashboard'}
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
