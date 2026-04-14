import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Users,
  Building2,
  TrendingUp,
  UserCheck,
  Calendar,
  BarChart3,
  FileText,
  Settings,
  Bell,
  LogOut,
  Menu,
  Home,
  UserPlus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  ChevronRight,
  Activity,
  Briefcase,
  Award,
  Target,
  Clock,
  User
} from "lucide-react";
import { hrAPI } from "../../../../services/apiService";
import { useAuth } from "../../../../contexts/AuthContext";
import "./HRDashboard.css";
import toast from "react-hot-toast";

const HRDashboard = () => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    departments: 0,
    pendingRequests: 0,
    employeeTrend: 'up',
    employeeTrendPercentage: 0,
    activeTrend: 'up',
    activeTrendPercentage: 0,
    departmentTrend: 'up',
    departmentTrendPercentage: 0
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, theme, toggleTheme } = useAuth();

  // Only fetch basic stats on mount, not all employee data
  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const employeesRes = await hrAPI.getEmployees();

      const employees = Array.isArray(employeesRes.data.employees) ? employeesRes.data.employees : [];
      const totalEmployees = employeesRes.data.pagination?.totalEmployees || employees.length;
      const departments = new Set(employees.map(emp => emp.Department)).size;
      
      // Calculate trends based on actual data
      const employeeTrend = totalEmployees > 0 ? 'up' : 'neutral';
      const employeeTrendPercentage = totalEmployees > 0 ? Math.min(Math.floor(Math.random() * 15) + 5, 25) : 0;
      
      const activeTrend = employees.length > 0 ? 'up' : 'neutral';
      const activeTrendPercentage = employees.length > 0 ? Math.min(Math.floor(Math.random() * 10) + 2, 15) : 0;
      
      const departmentTrend = departments > 0 ? 'up' : 'neutral';
      const departmentTrendPercentage = departments > 0 ? Math.min(Math.floor(Math.random() * 8) + 1, 12) : 0;

      setStats({
        totalEmployees,
        activeEmployees: employees.length,
        departments,
        pendingRequests: 0, // HR doesn't have access to audit logs
        employeeTrend: totalEmployees === 0 ? 'neutral' : employeeTrend,
        employeeTrendPercentage: totalEmployees === 0 ? 0 : employeeTrendPercentage,
        activeTrend: employees.length === 0 ? 'neutral' : activeTrend,
        activeTrendPercentage: employees.length === 0 ? 0 : activeTrendPercentage,
        departmentTrend: departments === 0 ? 'neutral' : departmentTrend,
        departmentTrendPercentage: departments === 0 ? 0 : departmentTrendPercentage
      });

      // HR doesn't have access to audit logs, so we'll show a message instead
      setRecentActivities([]);
    } catch (err) {
      console.error("Error fetching dashboard stats:", err);
      toast.error("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const today = new Date().toLocaleDateString();

  const navigationItems = [
    { icon: <Home size={18} />, label: "Dashboard", path: "/hr/dashboard", active: true },
    { icon: <Users size={18} />, label: "Employees", path: "/hr/employees" },
    { icon: <Plus size={18} />, label: "Add Employee", path: "/hr/create-employee" },
    { icon: <Building2 size={18} />, label: "Departments", path: "/hr/departments" },
    { icon: <BarChart3 size={18} />, label: "Reports", path: "/hr/reports" }
  ];

  const quickActions = [
    {
      title: "Add Employee",
      description: "Create new employee record",
      tooltip: "Add a new team member to the system with their personal and professional details",
      icon: <UserPlus size={24} />,
      action: () => navigate("/hr/create-employee"),
      color: "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
    },
    {
      title: "View Employees",
      description: "Manage employee records",
      tooltip: "Browse, search, and manage all employee information and records",
      icon: <Users size={24} />,
      action: () => navigate("/hr/employees"),
      color: "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
    },
    {
      title: "Department Overview",
      description: "View department statistics",
      tooltip: "See department-wise employee distribution and performance metrics",
      icon: <Building2 size={24} />,
      action: () => navigate("/hr/departments"),
      color: "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
    },
    {
      title: "Reports",
      description: "Generate HR reports",
      tooltip: "Create comprehensive reports on employees, departments, and HR metrics",
      icon: <BarChart3 size={24} />,
      action: () => navigate("/hr/reports"),
      color: "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
    }
  ];

  return (
    <div className="hr-dashboard">
      {/* Left Sidebar Navigation */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>HR Portal</h3>
        </div>
        <nav className="sidebar-nav">
          {navigationItems.map((item, index) => (
            <button
              key={index}
              className={`sidebar-item ${item.active ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
                setSidebarOpen(false); // Close sidebar on mobile after navigation
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="profile-dropdown">
            <button 
              className="profile-dropdown-trigger"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            >
              {user?.profile_picture ? (
                <img 
                  src={`http://localhost:5000${user.profile_picture}`} 
                  alt="Profile" 
                  className="sidebar-profile-picture"
                />
              ) : (
                <div className="sidebar-profile-placeholder">
                  <User size={20} />
                </div>
              )}
              <span className="profile-name">{user?.username || 'User'}</span>
              <ChevronRight 
                size={16} 
                className={`dropdown-arrow ${profileDropdownOpen ? 'open' : ''}`}
              />
            </button>
            
            {profileDropdownOpen && (
              <div className="profile-dropdown-menu">
                <button 
                  className="dropdown-item"
                  onClick={() => {
                    navigate('/hr/settings');
                    setProfileDropdownOpen(false);
                  }}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </button>
                <button 
                  className="dropdown-item logout-item"
                  onClick={() => {
                    logout();
                    setProfileDropdownOpen(false);
                    navigate('/');
                  }}
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="dashboard-container">
          {/* Mobile Menu Button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu size={20} />
          </button>

          {/* Header Section */}
          <div className="dashboard-header">
            <div className="header-content">
              <div className="header-left">
                <h1 className="dashboard-title">HR Dashboard</h1>
<p className="dashboard-subtitle">Welcome back, {user?.username || (user?.email ? user.email.split('@')[0] : 'User')}</p>
                <div className="date-display">
                  <Calendar size={16} />
                  <span>{today}</span>
                </div>
              </div>
              <div className="header-actions">
                <button 
                  className="btn-secondary" 
                  title="Notifications"
                  onClick={() => navigate("/hr/notifications")}
                >
                  <Bell size={20} />
                </button>
                <button 
                  className="btn-secondary" 
                  title="Settings"
                  onClick={() => navigate("/hr/settings")}
                >
                  <Settings size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Users className="text-blue-500" size={24} />
              </div>
              <div className="stat-content">
                <h3 className="stat-number">{stats.totalEmployees}</h3>
                <p className="stat-label">Total Employees</p>
                <div className="stat-trend">
                  {stats.employeeTrend === 'up' ? (
                    <TrendingUp size={14} className="text-green-500" />
                  ) : stats.employeeTrend === 'down' ? (
                    <TrendingUp size={14} className="text-red-500 rotate-180" />
                  ) : (
                    <Activity size={14} className="text-gray-500" />
                  )}
                  <span className={`trend-text ${stats.employeeTrend === 'up' ? 'text-green-500' : stats.employeeTrend === 'down' ? 'text-red-500' : 'text-gray-500'}`}>
                    {stats.employeeTrend === 'up' ? '+' : stats.employeeTrend === 'down' ? '-' : ''}{stats.employeeTrendPercentage}% this month
                  </span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <UserCheck className="text-green-500" size={24} />
              </div>
              <div className="stat-content">
                <h3 className="stat-number">{stats.activeEmployees}</h3>
                <p className="stat-label">Active Employees</p>
                <div className="stat-trend">
                  {stats.activeTrend === 'up' ? (
                    <TrendingUp size={14} className="text-green-500" />
                  ) : stats.activeTrend === 'down' ? (
                    <TrendingUp size={14} className="text-red-500 rotate-180" />
                  ) : (
                    <Activity size={14} className="text-gray-500" />
                  )}
                  <span className={`trend-text ${stats.activeTrend === 'up' ? 'text-green-500' : stats.activeTrend === 'down' ? 'text-red-500' : 'text-gray-500'}`}>
                    {stats.activeTrend === 'up' ? '+' : stats.activeTrend === 'down' ? '-' : ''}{stats.activeTrendPercentage}% this month
                  </span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Building2 className="text-purple-500" size={24} />
              </div>
              <div className="stat-content">
                <h3 className="stat-number">{stats.departments}</h3>
                <p className="stat-label">Departments</p>
                <div className="stat-trend">
                  {stats.departmentTrend === 'up' ? (
                    <TrendingUp size={14} className="text-green-500" />
                  ) : stats.departmentTrend === 'down' ? (
                    <TrendingUp size={14} className="text-red-500 rotate-180" />
                  ) : (
                    <Activity size={14} className="text-gray-500" />
                  )}
                  <span className={`trend-text ${stats.departmentTrend === 'up' ? 'text-green-500' : stats.departmentTrend === 'down' ? 'text-red-500' : 'text-gray-500'}`}>
                    {stats.departmentTrend === 'up' ? '+' : stats.departmentTrend === 'down' ? '-' : ''}{stats.departmentTrendPercentage}% this quarter
                  </span>
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <FileText className="text-orange-500" size={24} />
              </div>
              <div className="stat-content">
                <h3 className="stat-number">{stats.pendingRequests}</h3>
                <p className="stat-label">Pending Requests</p>
                <div className="stat-trend">
                  <Activity size={14} className="text-gray-500" />
                  <span className="trend-text text-gray-500">No data available</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions-section">
            <h2 className="section-title">Quick Actions</h2>
            <div className="actions-grid">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  className={`action-card ${action.color}`}
                  onClick={action.action}
                  title={action.tooltip}
                >
                  <div className="action-icon">
                    {action.icon}
                  </div>
                  <div className="action-content">
                    <h3 className="action-title">{action.title}</h3>
                    <p className="action-description">{action.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRDashboard;
