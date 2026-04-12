import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  FileText, 
  UserCheck, 
  LogOut, 
  Search,
  Bell,
  User,
  ChevronDown,
  Menu,
  X
} from "lucide-react";
import "./AdminShell.css";

const AdminShell = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navigation = [
    {
      name: "Dashboard",
      href: "/AdminDashboard",
      icon: LayoutDashboard,
      badge: null
    },
    {
      name: "User Directory",
      href: "/admin/users",
      icon: Users,
      badge: null
    },
    {
      name: "User Control",
      href: "/admin/usermanagement",
      icon: Settings,
      badge: null
    },
    {
      name: "Activity Log",
      href: "/admin/auditlog",
      icon: FileText,
      badge: null
    },
    {
      name: "HR Portal",
      href: "/admin/hr",
      icon: UserCheck,
      badge: null
    }
  ];

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="admin-shell">
      {/* Top Navigation */}
      <header className="admin-header">
        <div className="header-left">
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="brand">
            <span className="brand-text">EmploCore</span>
          </div>
        </div>

        <div className="header-center">
          <div className="global-search">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search users, activities, settings..."
              className="search-input"
            />
          </div>
        </div>

        <div className="header-right">
          <button className="notification-bell">
            <Bell size={20} />
            <span className="notification-dot"></span>
          </button>

          <div className="user-menu">
            <button 
              className="user-button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div className="user-avatar">
                <User size={18} />
              </div>
              <span className="user-name">{localStorage.getItem('username') || 'Admin'}</span>
              <ChevronDown size={16} className="dropdown-arrow" />
            </button>

            {userMenuOpen && (
              <div className="user-dropdown">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    <User size={20} />
                  </div>
                  <div className="dropdown-info">
                    <span className="dropdown-name">{localStorage.getItem('username') || 'Admin'}</span>
                    <span className="dropdown-role">Administrator</span>
                  </div>
                </div>
                <div className="divider"></div>
                <button className="dropdown-item" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="admin-body">
        {/* Sidebar */}
        <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <nav className="sidebar-nav">
            <ul className="nav-list">
              {navigation.map((item) => (
                <li key={item.name}>
                  <button
                    className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
                    onClick={() => navigate(item.href)}
                  >
                    <item.icon size={20} className="nav-icon" />
                    <span className="nav-text">{item.name}</span>
                    {item.badge && (
                      <span className="nav-badge">{item.badge}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="sidebar-footer">
            <div className="system-info">
              <div className="info-item">
                <span className="info-label">System Status</span>
                <span className="info-value online">Online</span>
              </div>
              <div className="info-item">
                <span className="info-label">Version</span>
                <span className="info-value">v2.1.0</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`admin-main ${sidebarOpen ? 'with-sidebar' : 'full-width'}`}>
          <div className="content-wrapper">
            <div className="page-header">
              <div className="breadcrumb-trail">
                <span className="breadcrumb-item">Admin</span>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-item current">
                  {navigation.find(item => isActive(item.href))?.name || 'Dashboard'}
                </span>
              </div>
              <div className="page-title-section">
                <h1 className="page-title">{title}</h1>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
              </div>
            </div>

            <div className="page-content">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminShell;
