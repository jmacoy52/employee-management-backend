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
  Save,
  RefreshCw,
  Database,
  Shield,
  Globe,
  Mail,
  Key,
  Server,
  Wifi,
  HardDrive,
  Activity,
  CheckCircle,
  AlertTriangle,
  Clock,
  Briefcase
} from "lucide-react";
import "./AdminDashboard.css";

const SystemSettings = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    systemName: 'EmploCore',
    systemEmail: 'admin@emplocore.com',
    maintenanceMode: false,
    allowRegistration: true,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireEmailVerification: true,
    backupSchedule: 'daily',
    logRetentionDays: 90,
    apiRateLimit: 1000
  });
  const [systemStatus, setSystemStatus] = useState({
    database: 'healthy',
    server: 'healthy',
    storage: 'healthy',
    network: 'healthy'
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadSystemSettings();
    checkSystemStatus();
  }, []);

  const loadSystemSettings = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const response = await axios.get('/api/admin/settings');
      // setSettings(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load settings:', err);
      toast.error('Failed to load system settings');
      setLoading(false);
    }
  };

  const checkSystemStatus = async () => {
    try {
      // TODO: Replace with actual API call
      // const response = await axios.get('/api/admin/system-status');
      // setSystemStatus(response.data);
    } catch (err) {
      console.error('Failed to check system status:', err);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      // TODO: Replace with actual API call
      // await axios.put('/api/admin/settings', settings);
      
      toast.success('System settings saved successfully');
      setSaving(false);
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save system settings');
      setSaving(false);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, active: false },
    { id: 'usermanagement', label: 'User Management', icon: Settings, active: false },
    { id: 'auditlogs', label: 'Audit Logs', icon: FileText, active: false },
    { id: 'system', label: 'System Settings', icon: Settings, active: true },
    { id: 'reports', label: 'System Reports', icon: BarChart3, active: false }
  ];

  const getStatusIcon = (status) => {
    switch(status) {
      case 'healthy': return <CheckCircle size={16} className="status-icon healthy" />;
      case 'warning': return <AlertTriangle size={16} className="status-icon warning" />;
      case 'error': return <AlertTriangle size={16} className="status-icon error" />;
      default: return <Activity size={16} className="status-icon unknown" />;
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'healthy': return 'Operational';
      case 'warning': return 'Warning';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading system settings...</p>
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
                    else if (item.id === 'reports') navigate('/admin/reports');
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
            <h1 className="page-title">System Settings</h1>
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

        {/* System Settings Content */}
        <main className="dashboard-content">
          {/* System Status */}
          <div className="settings-section">
            <h2 className="section-title">System Status</h2>
            <div className="status-grid">
              <div className="status-card">
                <div className="status-header">
                  <Database size={24} />
                  <span>Database</span>
                </div>
                <div className="status-body">
                  {getStatusIcon(systemStatus.database)}
                  <span className="status-text">{getStatusText(systemStatus.database)}</span>
                </div>
              </div>

              <div className="status-card">
                <div className="status-header">
                  <Server size={24} />
                  <span>Server</span>
                </div>
                <div className="status-body">
                  {getStatusIcon(systemStatus.server)}
                  <span className="status-text">{getStatusText(systemStatus.server)}</span>
                </div>
              </div>

              <div className="status-card">
                <div className="status-header">
                  <HardDrive size={24} />
                  <span>Storage</span>
                </div>
                <div className="status-body">
                  {getStatusIcon(systemStatus.storage)}
                  <span className="status-text">{getStatusText(systemStatus.storage)}</span>
                </div>
              </div>

              <div className="status-card">
                <div className="status-header">
                  <Wifi size={24} />
                  <span>Network</span>
                </div>
                <div className="status-body">
                  {getStatusIcon(systemStatus.network)}
                  <span className="status-text">{getStatusText(systemStatus.network)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* General Settings */}
          <div className="settings-section">
            <h2 className="section-title">General Settings</h2>
            <div className="settings-grid">
              <div className="setting-item">
                <label className="setting-label">
                  <Globe size={16} />
                  System Name
                </label>
                <input
                  type="text"
                  value={settings.systemName}
                  onChange={(e) => handleSettingChange('systemName', e.target.value)}
                  className="setting-input"
                />
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <Mail size={16} />
                  System Email
                </label>
                <input
                  type="email"
                  value={settings.systemEmail}
                  onChange={(e) => handleSettingChange('systemEmail', e.target.value)}
                  className="setting-input"
                />
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <Activity size={16} />
                  Maintenance Mode
                </label>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.maintenanceMode}
                    onChange={(e) => handleSettingChange('maintenanceMode', e.target.checked)}
                    className="toggle-input"
                  />
                  <span className="toggle-slider"></span>
                </div>
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <User size={16} />
                  Allow Registration
                </label>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.allowRegistration}
                    onChange={(e) => handleSettingChange('allowRegistration', e.target.checked)}
                    className="toggle-input"
                  />
                  <span className="toggle-slider"></span>
                </div>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="settings-section">
            <h2 className="section-title">Security Settings</h2>
            <div className="settings-grid">
              <div className="setting-item">
                <label className="setting-label">
                  <Clock size={16} />
                  Session Timeout (minutes)
                </label>
                <input
                  type="number"
                  value={settings.sessionTimeout}
                  onChange={(e) => handleSettingChange('sessionTimeout', parseInt(e.target.value))}
                  className="setting-input"
                  min="5"
                  max="1440"
                />
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <Shield size={16} />
                  Max Login Attempts
                </label>
                <input
                  type="number"
                  value={settings.maxLoginAttempts}
                  onChange={(e) => handleSettingChange('maxLoginAttempts', parseInt(e.target.value))}
                  className="setting-input"
                  min="3"
                  max="10"
                />
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <Key size={16} />
                  Password Min Length
                </label>
                <input
                  type="number"
                  value={settings.passwordMinLength}
                  onChange={(e) => handleSettingChange('passwordMinLength', parseInt(e.target.value))}
                  className="setting-input"
                  min="6"
                  max="32"
                />
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <Mail size={16} />
                  Require Email Verification
                </label>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.requireEmailVerification}
                    onChange={(e) => handleSettingChange('requireEmailVerification', e.target.checked)}
                    className="toggle-input"
                  />
                  <span className="toggle-slider"></span>
                </div>
              </div>
            </div>
          </div>

          {/* System Settings */}
          <div className="settings-section">
            <h2 className="section-title">System Settings</h2>
            <div className="settings-grid">
              <div className="setting-item">
                <label className="setting-label">
                  <RefreshCw size={16} />
                  Backup Schedule
                </label>
                <select
                  value={settings.backupSchedule}
                  onChange={(e) => handleSettingChange('backupSchedule', e.target.value)}
                  className="setting-select"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <FileText size={16} />
                  Log Retention (days)
                </label>
                <input
                  type="number"
                  value={settings.logRetentionDays}
                  onChange={(e) => handleSettingChange('logRetentionDays', parseInt(e.target.value))}
                  className="setting-input"
                  min="7"
                  max="365"
                />
              </div>

              <div className="setting-item">
                <label className="setting-label">
                  <Activity size={16} />
                  API Rate Limit (requests/minute)
                </label>
                <input
                  type="number"
                  value={settings.apiRateLimit}
                  onChange={(e) => handleSettingChange('apiRateLimit', parseInt(e.target.value))}
                  className="setting-input"
                  min="100"
                  max="10000"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="settings-actions">
            <button 
              className="btn btn-primary"
              onClick={handleSaveSettings}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button 
              className="btn btn-secondary"
              onClick={loadSystemSettings}
            >
              <RefreshCw size={16} />
              Reset
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SystemSettings;
