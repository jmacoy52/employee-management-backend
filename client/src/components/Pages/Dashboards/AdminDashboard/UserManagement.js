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
  Plus,
  Edit,
  Trash2,
  Filter,
  Download,
  RefreshCw,
  Shield,
  UserCheck,
  Briefcase,
  Eye
} from "lucide-react";
import "./AdminDashboard.css";

const UserManagement = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      if (!token) {
        throw new Error("Authentication required");
      }

      console.log("Fetching users...");

      const response = await axios.get("http://localhost:5000/api/users/all", {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log("Users response:", response.data);
      setUsers(Array.isArray(response.data) ? response.data : []);
      setLoading(false);
    } catch (err) {
      console.error("Users fetch error:", err);
      toast.error("Failed to fetch users: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (roleFilter !== "all") {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    setFilteredUsers(filtered);
  };

  const handleDeleteUser = async (userId, username) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      try {
        const token = localStorage.getItem("token");
        await axios.delete(`http://localhost:5000/api/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        toast.success(`User "${username}" deleted successfully`);
        fetchUsers(); // Refresh the user list
      } catch (err) {
        console.error("Delete user error:", err);
        toast.error("Failed to delete user: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const handleEditUser = (user) => {
    // TODO: Implement edit user functionality
    toast.info(`Edit functionality for "${user.username}" coming soon!`);
  };

  const handleViewUser = (user) => {
    // TODO: Implement view user details
    toast.info(`View details for "${user.username}" coming soon!`);
  };

  const handleChangeRole = async (userId, currentRole, username) => {
    const roleOptions = ['super_admin', 'admin', 'hr', 'employee'];
    const currentRoleIndex = roleOptions.indexOf(currentRole);
    const nextRoleIndex = (currentRoleIndex + 1) % roleOptions.length;
    const newRole = roleOptions[nextRoleIndex];
    
    if (window.confirm(`Change role for "${username}" from "${currentRole.replace('_', ' ')}" to "${newRole.replace('_', ' ')}"?`)) {
      try {
        const token = localStorage.getItem("token");
        await axios.put(`http://localhost:5000/api/admin/users/${userId}/role`, 
          { role: newRole },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        toast.success(`Role for "${username}" changed to "${newRole.replace('_', ' ').toUpperCase()}"`);
        fetchUsers(); // Refresh the user list
      } catch (err) {
        console.error("Role change error:", err);
        toast.error("Failed to change role: " + (err.response?.data?.error || err.message));
      }
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login");
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, active: false },
    { id: 'usermanagement', label: 'User Management', icon: Settings, active: true },
    { id: 'auditlogs', label: 'Audit Logs', icon: FileText, active: false },
    { id: 'system', label: 'System Settings', icon: Settings, active: false },
    { id: 'reports', label: 'System Reports', icon: BarChart3, active: false }
  ];

  const getRoleIcon = (role) => {
    switch(role) {
      case 'super_admin': return <Shield size={16} />;
      case 'admin': return <Shield size={16} />;
      case 'hr': return <UserCheck size={16} />;
      case 'employee': return <Briefcase size={16} />;
      default: return <User size={16} />;
    }
  };

  const getRoleColor = (role) => {
    switch(role) {
      case 'super_admin': return '#ef4444';
      case 'admin': return '#3b82f6';
      case 'hr': return '#10b981';
      case 'employee': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading user management...</p>
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
                    else if (item.id === 'auditlogs') navigate('/admin/auditlog');
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
            <h1 className="page-title">User Management</h1>
          </div>

          <div className="top-bar-right">
            <div className="search-bar">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search users..." 
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

        {/* User Management Content */}
        <main className="dashboard-content">
          {/* Controls */}
          <div className="user-controls">
            <div className="controls-left">
              <button className="btn btn-primary">
                <Plus size={16} />
                Add User
              </button>
              <div className="filter-dropdown">
                <Filter size={16} />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="all">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="hr">HR</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
            </div>
            
            <div className="controls-right">
              <button className="btn btn-secondary" onClick={fetchUsers}>
                <RefreshCw size={16} />
                Refresh
              </button>
              <button className="btn btn-secondary">
                <Download size={16} />
                Export
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="users-table-container">
            <div className="table-header">
              <h3>All Users</h3>
              <p>{filteredUsers.length} users found</p>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="no-users-state">
                <div className="no-users-icon">
                  <Users size={48} />
                </div>
                <h4>No Users Found</h4>
                <p>
                  {searchTerm || roleFilter !== "all" 
                    ? "Try adjusting your search or filter criteria"
                    : "No users have been added to the system yet"}
                </p>
                {!searchTerm && roleFilter === "all" && (
                  <button className="btn btn-primary">
                    <Plus size={16} />
                    Add First User
                  </button>
                )}
              </div>
            ) : (
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar-small">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="user-details">
                              <div className="user-name">{user.username}</div>
                              <div className="user-id">ID: {user.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="email-cell">
                            <span className="email-text">{user.email}</span>
                          </div>
                        </td>
                        <td>
                          <div className="role-badge-custom" style={{ color: getRoleColor(user.role) }}>
                            {getRoleIcon(user.role)}
                            <span>{user.role.replace('_', ' ').toUpperCase()}</span>
                          </div>
                        </td>
                        <td>
                          <span className="status-badge active">
                            <div className="status-dot"></div>
                            Active
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="action-btn view" 
                              title="View User Details"
                              onClick={() => handleViewUser(user)}
                            >
                              <Eye size={14} />
                            </button>
                            <button 
                              className="action-btn role" 
                              title="Change User Role"
                              onClick={() => handleChangeRole(user.id, user.role, user.username)}
                              disabled={user.role === 'super_admin' && localStorage.getItem('username') !== user.username}
                            >
                              <Shield size={14} />
                            </button>
                            <button 
                              className="action-btn edit" 
                              title="Edit User"
                              onClick={() => handleEditUser(user)}
                            >
                              <Edit size={14} />
                            </button>
                            <button 
                              className="action-btn delete" 
                              title="Delete User"
                              onClick={() => handleDeleteUser(user.id, user.username)}
                              disabled={user.role === 'super_admin'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default UserManagement;
