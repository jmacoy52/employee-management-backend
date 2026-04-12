import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import { 
  Users, 
  Building, 
  Settings, 
  FileText, 
  BarChart3, 
  Search,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Filter,
  Download,
  RefreshCw,
  Activity,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Eye,
  Briefcase
} from "lucide-react";
import "./AdminDashboard.css";

const AuditLog = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 20;
  const navigate = useNavigate();

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [auditLogs, searchTerm, actionFilter]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      if (!token) {
        throw new Error("Authentication required");
      }

      console.log("Fetching audit logs...");

      const response = await axios.get("http://localhost:5000/api/admin/audit-logs", {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log("Audit logs response:", response.data);
      setAuditLogs(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (err) {
      console.error("Audit logs fetch error:", err);
      toast.error("Failed to fetch audit logs: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const filterLogs = () => {
    let filtered = auditLogs;

    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.username?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (actionFilter !== "all") {
      filtered = filtered.filter(log => log.action_type === actionFilter);
    }

    setFilteredLogs(filtered);
    setCurrentPage(1);
  };

  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * logsPerPage,
    currentPage * logsPerPage
  );

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const exportLogs = () => {
    const csv = [
      ['ID', 'Action', 'Description', 'User', 'Date', 'IP Address'],
      ...filteredLogs.map(log => [
        log.id,
        log.action_type || 'N/A',
        log.description || 'N/A',
        log.username || 'N/A',
        new Date(log.created_at).toLocaleString(),
        log.ip_address || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success('Audit logs exported successfully');
  };

  const getActionIcon = (actionType) => {
    switch(actionType) {
      case 'USER_REGISTER': return <User size={16} />;
      case 'USER_DELETE': return <AlertCircle size={16} />;
      case 'LOGIN': return <User size={16} />;
      case 'LOGOUT': return <LogOut size={16} />;
      case 'PASSWORD_CHANGE': return <Settings size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getActionColor = (actionType) => {
    switch(actionType) {
      case 'USER_REGISTER': return '#10b981';
      case 'USER_DELETE': return '#ef4444';
      case 'LOGIN': return '#3b82f6';
      case 'LOGOUT': return '#6b7280';
      case 'PASSWORD_CHANGE': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, active: false },
    { id: 'usermanagement', label: 'User Management', icon: Settings, active: false },
    { id: 'auditlogs', label: 'Audit Logs', icon: FileText, active: true },
    { id: 'system', label: 'System Settings', icon: Settings, active: false },
    { id: 'reports', label: 'System Reports', icon: BarChart3, active: false }
  ];

  if (loading) {
    return (
      <div className="admin-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading audit logs...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <Briefcase size={24} />
            </div>
            <span className="logo-text">EmploCore Admin</span>
          </div>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-list">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button 
                  className={`nav-item ${item.active ? 'active' : ''}`}
                  onClick={() => {
                    if (item.id === 'dashboard') navigate('/AdminDashboard');
                    else if (item.id === 'usermanagement') navigate('/admin/usermanagement');
                  }}
                >
                  <item.icon size={20} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={20} className="logout-icon" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`main-content ${sidebarOpen ? 'with-sidebar' : 'full-width'}`}>
        {/* Top Bar */}
        <header className="top-bar">
          <div className="page-title-section">
            <h1 className="page-title">Audit Logs</h1>
          </div>

          <div className="top-bar-right">
            <div className="search-bar">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="notification-btn">
              <Bell size={20} />
              <span className="notification-dot"></span>
            </button>

            <div className="user-dropdown">
              <button 
                className="user-profile-btn"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              >
                <div className="user-avatar">
                  <User size={20} />
                </div>
                <div className="user-info">
                  <span className="user-name">{localStorage.getItem('username') || 'Admin'}</span>
                  <span className="user-role">Administrator</span>
                </div>
              </button>

              {userDropdownOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <div className="dropdown-avatar">
                      <User size={24} />
                    </div>
                    <div className="dropdown-info">
                      <span className="dropdown-name">{localStorage.getItem('username') || 'Admin'}</span>
                      <span className="dropdown-role">Administrator</span>
                    </div>
                  </div>
                  <button className="dropdown-item" onClick={handleLogout}>
                    <LogOut size={16} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Audit Log Content */}
        <main className="dashboard-content">
          {/* Controls */}
          <div className="user-controls">
            <div className="controls-left">
              <div className="filter-dropdown">
                <Filter size={16} />
                <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
                  <option value="all">All Actions</option>
                  <option value="USER_REGISTER">User Registration</option>
                  <option value="USER_DELETE">User Deletion</option>
                  <option value="LOGIN">Login</option>
                  <option value="LOGOUT">Logout</option>
                  <option value="PASSWORD_CHANGE">Password Change</option>
                </select>
              </div>
            </div>
            
            <div className="controls-right">
              <button className="btn btn-secondary" onClick={fetchAuditLogs}>
                <RefreshCw size={16} />
                Refresh
              </button>
              <button className="btn btn-secondary" onClick={exportLogs}>
                <Download size={16} />
                Export
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="users-table-container">
            <div className="table-header">
              <h3>System Activity Logs</h3>
              <p>{filteredLogs.length} logs found</p>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="no-users-state">
                <div className="no-users-icon">
                  <FileText size={48} />
                </div>
                <h4>No Audit Logs Found</h4>
                <p>
                  {searchTerm || actionFilter !== "all" 
                    ? "Try adjusting your search or filter criteria"
                    : "No system activity has been recorded yet"}
                </p>
              </div>
            ) : (
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Description</th>
                      <th>User</th>
                      <th>Date & Time</th>
                      <th>IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <div className="action-type-badge" style={{ color: getActionColor(log.action_type) }}>
                            {getActionIcon(log.action_type)}
                            <span>{log.action_type?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="log-description">
                            {log.description || 'No description available'}
                          </div>
                        </td>
                        <td>
                          <div className="log-user">
                            <User size={14} />
                            <span>{log.username || 'System'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="log-date">
                            <Calendar size={14} />
                            <span>{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                        </td>
                        <td>
                          <div className="log-ip">
                            <span>{log.ip_address || 'N/A'}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  className="pagination-btn" 
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <div className="pagination-info">
                  Page {currentPage} of {totalPages} ({filteredLogs.length} logs)
                </div>
                <button 
                  className="pagination-btn" 
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuditLog;
