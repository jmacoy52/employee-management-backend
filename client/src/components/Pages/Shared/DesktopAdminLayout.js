import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Home, 
  Users, 
  Settings, 
  FileText, 
  UserCheck, 
  LogOut, 
  ChevronDown,
  ChevronRight,
  Grid3x3,
  Shield,
  Bell,
  Search,
  Menu
} from "lucide-react";
import "./DesktopAdminLayout.css";

const DesktopAdminLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const navigation = [
    {
      category: "Main",
      items: [
        { name: "Dashboard", href: "/AdminDashboard", icon: Home, description: "System overview" },
        { name: "Users", href: "/admin/users", icon: Users, description: "User management" },
        { name: "User Management", href: "/admin/usermanagement", icon: Settings, description: "Advanced user control" },
      ]
    },
    {
      category: "System",
      items: [
        { name: "Audit Log", href: "/admin/auditlog", icon: FileText, description: "Activity logs" },
        { name: "HR Dashboard", href: "/admin/hr", icon: UserCheck, description: "HR operations" },
      ]
    }
  ];

  const isActive = (href) => location.pathname === href;

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <div className="desktop-admin">
      {/* Top Navigation Bar */}
      <header className="top-nav">
        <div className="nav-left">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
          >
            <Menu size={20} />
          </button>
          <div className="brand">
            <Shield className="brand-icon" />
            <span className="brand-name">EmploCore Admin</span>
          </div>
        </div>
        
        <div className="nav-center">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search users, logs, settings..." />
          </div>
        </div>
        
        <div className="nav-right">
          <button className="notification-btn">
            <Bell size={20} />
            <span className="notification-badge">3</span>
          </button>
          
          <div className="profile-section">
            <button 
              className="profile-btn"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            >
              <div className="profile-avatar">
                {localStorage.getItem('username')?.charAt(0).toUpperCase() || 'A'}
              </div>
              <div className="profile-info">
                <span className="profile-name">{localStorage.getItem('username') || 'Admin'}</span>
                <span className="profile-role">Administrator</span>
              </div>
              <ChevronDown size={16} className="dropdown-arrow" />
            </button>
            
            {profileDropdownOpen && (
              <div className="profile-dropdown">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {localStorage.getItem('username')?.charAt(0).toUpperCase() || 'A'}
                  </div>
                  <div className="dropdown-info">
                    <span className="dropdown-name">{localStorage.getItem('username') || 'Admin'}</span>
                    <span className="dropdown-email">admin@emplocore.com</span>
                  </div>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item">
                  <Settings size={16} />
                  <span>Settings</span>
                </button>
                <button className="dropdown-item" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="admin-container">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarExpanded ? 'expanded' : 'collapsed'}`}>
          <div className="sidebar-content">
            {navigation.map((section, index) => (
              <div key={section.category} className="nav-section">
                <h3 className="section-title">{section.category}</h3>
                <nav className="nav-items">
                  {section.items.map((item) => (
                    <button
                      key={item.name}
                      className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                      onClick={() => navigate(item.href)}
                    >
                      <item.icon className="nav-icon" size={18} />
                      <span className="nav-text">{item.name}</span>
                      {sidebarExpanded && (
                        <span className="nav-description">{item.description}</span>
                      )}
                      <ChevronRight className="nav-arrow" size={14} />
                    </button>
                  ))}
                </nav>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className={`main-content ${sidebarExpanded ? 'with-sidebar' : 'full-width'}`}>
          <div className="content-header">
            <div className="breadcrumb">
              <span>Admin</span>
              <ChevronRight size={14} />
              <span className="current-page">
                {navigation.flatMap(section => section.items)
                  .find(item => isActive(item.href))?.name || 'Dashboard'}
              </span>
            </div>
            <div className="page-title-section">
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
          </div>

          <div className="content-body">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DesktopAdminLayout;
