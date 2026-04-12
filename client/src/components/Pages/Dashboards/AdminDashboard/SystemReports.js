import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import { 
  Users, 
  Settings, 
  FileText, 
  BarChart3, 
  Search,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  Download,
  RefreshCw,
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  Activity,
  Database,
  Shield,
  Globe,
  Clock,
  CheckCircle,
  AlertTriangle,
  Server,
  Wifi,
  HardDrive,
  Eye,
  ChevronLeft,
  ChevronRight,
  Briefcase
} from "lucide-react";
import "./AdminDashboard.css";

const SystemReports = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([
    {
      id: 1,
      name: 'User Activity Report',
      description: 'Comprehensive user activity and login statistics',
      type: 'users',
      lastGenerated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      schedule: 'weekly',
      status: 'active'
    },
    {
      id: 2,
      name: 'System Performance Report',
      description: 'Server performance, response times, and resource usage',
      type: 'performance',
      lastGenerated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      schedule: 'daily',
      status: 'active'
    },
    {
      id: 3,
      name: 'Security Audit Report',
      description: 'Security events, failed logins, and access patterns',
      type: 'security',
      lastGenerated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      schedule: 'monthly',
      status: 'active'
    },
    {
      id: 4,
      name: 'Database Usage Report',
      description: 'Database performance, storage usage, and query statistics',
      type: 'database',
      lastGenerated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      schedule: 'daily',
      status: 'active'
    },
    {
      id: 5,
      name: 'API Usage Report',
      description: 'API endpoint usage, rate limiting, and error rates',
      type: 'api',
      lastGenerated: new Date(Date.now() - 12 * 60 * 60 * 1000),
      schedule: 'hourly',
      status: 'active'
    }
  ]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [dateRange, setDateRange] = useState('7days');
  const [reportType, setReportType] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const response = await axios.get('/api/admin/reports');
      // setReports(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load reports:', err);
      toast.error('Failed to load system reports');
      setLoading(false);
    }
  };

  const generateReport = async (reportId) => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // await axios.post(`/api/admin/reports/${reportId}/generate`);
      toast.success('Report generation started');
      loadReports();
    } catch (err) {
      console.error('Failed to generate report:', err);
      toast.error('Failed to generate report');
      setLoading(false);
    }
  };

  const downloadReport = async (reportId) => {
    try {
      // TODO: Replace with actual API call
      // const response = await axios.get(`/api/admin/reports/${reportId}/download`);
      // Create download link
      toast.success('Report downloaded successfully');
    } catch (err) {
      console.error('Failed to download report:', err);
      toast.error('Failed to download report');
    }
  };

  const viewReport = (report) => {
    setSelectedReport(report);
    // TODO: Navigate to report detail view or open modal
    toast.info(`Viewing ${report.name}`);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, active: false },
    { id: 'usermanagement', label: 'User Management', icon: Settings, active: false },
    { id: 'auditlogs', label: 'Audit Logs', icon: FileText, active: false },
    { id: 'system', label: 'System Settings', icon: Settings, active: false },
    { id: 'reports', label: 'System Reports', icon: BarChart3, active: true }
  ];

  const getReportIcon = (type) => {
    switch(type) {
      case 'users': return <Users size={20} />;
      case 'performance': return <Server size={20} />;
      case 'security': return <Shield size={20} />;
      case 'database': return <Database size={20} />;
      case 'api': return <Globe size={20} />;
      default: return <FileText size={20} />;
    }
  };

  const getReportColor = (type) => {
    switch(type) {
      case 'users': return '#3b82f6';
      case 'performance': return '#10b981';
      case 'security': return '#f59e0b';
      case 'database': return '#8b5cf6';
      case 'api': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'active': return <CheckCircle size={16} className="status-icon active" />;
      case 'inactive': return <AlertTriangle size={16} className="status-icon inactive" />;
      default: return <Activity size={16} className="status-icon unknown" />;
    }
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (loading) {
    return (
      <div className="admin-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading system reports...</p>
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
                    else if (item.id === 'auditlogs') navigate('/admin/auditlog');
                    else if (item.id === 'system') navigate('/admin/system');
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
            <h1 className="page-title">System Reports</h1>
          </div>

          <div className="top-bar-right">
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

        {/* System Reports Content */}
        <main className="dashboard-content">
          {/* Report Controls */}
          <div className="user-controls">
            <div className="controls-left">
              <div className="filter-dropdown">
                <Filter size={16} />
                <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="filter-select">
                  <option value="all">All Reports</option>
                  <option value="users">User Reports</option>
                  <option value="performance">Performance Reports</option>
                  <option value="security">Security Reports</option>
                  <option value="database">Database Reports</option>
                  <option value="api">API Reports</option>
                </select>
              </div>
              
              <div className="filter-dropdown">
                <Calendar size={16} />
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="filter-select">
                  <option value="24hours">Last 24 Hours</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="90days">Last 90 Days</option>
                </select>
              </div>
            </div>
            
            <div className="controls-right">
              <button className="btn btn-secondary" onClick={loadReports}>
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>

          {/* Reports Grid */}
          <div className="reports-grid">
            {reports.map((report) => (
              <div key={report.id} className="report-card">
                <div className="report-header">
                  <div className="report-icon" style={{ background: getReportColor(report.type) }}>
                    {getReportIcon(report.type)}
                  </div>
                  <div className="report-status">
                    {getStatusIcon(report.status)}
                  </div>
                </div>
                
                <div className="report-body">
                  <h3 className="report-name">{report.name}</h3>
                  <p className="report-description">{report.description}</p>
                  
                  <div className="report-meta">
                    <div className="meta-item">
                      <Clock size={14} />
                      <span>Last: {formatDate(report.lastGenerated)}</span>
                    </div>
                    <div className="meta-item">
                      <RefreshCw size={14} />
                      <span>Schedule: {report.schedule}</span>
                    </div>
                  </div>
                </div>
                
                <div className="report-actions">
                  <button 
                    className="report-action-btn primary"
                    onClick={() => generateReport(report.id)}
                  >
                    <RefreshCw size={14} />
                    Generate
                  </button>
                  <button 
                    className="report-action-btn secondary"
                    onClick={() => viewReport(report)}
                  >
                    <Eye size={14} />
                    View
                  </button>
                  <button 
                    className="report-action-btn secondary"
                    onClick={() => downloadReport(report.id)}
                  >
                    <Download size={14} />
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Report Summary */}
          <div className="report-summary">
            <h2 className="section-title">Report Summary</h2>
            <div className="summary-grid">
              <div className="summary-item">
                <div className="summary-icon">
                  <FileText size={24} />
                </div>
                <div className="summary-content">
                  <div className="summary-value">{reports.length}</div>
                  <div className="summary-label">Total Reports</div>
                </div>
              </div>
              
              <div className="summary-item">
                <div className="summary-icon">
                  <CheckCircle size={24} />
                </div>
                <div className="summary-content">
                  <div className="summary-value">{reports.filter(r => r.status === 'active').length}</div>
                  <div className="summary-label">Active Reports</div>
                </div>
              </div>
              
              <div className="summary-item">
                <div className="summary-icon">
                  <Calendar size={24} />
                </div>
                <div className="summary-content">
                  <div className="summary-value">{reports.filter(r => r.schedule === 'daily').length}</div>
                  <div className="summary-label">Daily Reports</div>
                </div>
              </div>
              
              <div className="summary-item">
                <div className="summary-icon">
                  <TrendingUp size={24} />
                </div>
                <div className="summary-content">
                  <div className="summary-value">98%</div>
                  <div className="summary-label">Success Rate</div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SystemReports;
