import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Eye,
  Filter,
  Mail,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCheck,
  Users
} from "lucide-react";
import { adminAPI } from "../../../../services/apiService";
import { useAuth } from "../../../../contexts/AuthContext";
import "./UserManagement.css";

const roleLabels = {
  super_admin: "Super Admin",
  admin: "Admin",
  hr: "HR",
  employee: "Employee"
};

const UserManagement = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    role: "employee",
    firstName: "",
    lastName: "",
    department: "",
    position: ""
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers();
      setUsers(response.data.users || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error(error.response?.data?.error || "Failed to fetch tenant users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((entry) => {
      const matchesSearch =
        !searchTerm ||
        (entry.username || entry.email.split("@")[0]).toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole = roleFilter === "all" || entry.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  const summary = useMemo(() => ({
    total: users.length,
    admins: users.filter((entry) => entry.role === "admin").length,
    hr: users.filter((entry) => entry.role === "hr").length,
    employees: users.filter((entry) => entry.role === "employee").length
  }), [users]);

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.role) {
      toast.error("Email and role are required.");
      return;
    }

    try {
      setCreatingUser(true);
      const response = await adminAPI.createUser(newUser);
      setCreatedCredentials({
        email: response.data.user.email,
        username: response.data.user.username,
        temporaryPassword: response.data.temporaryPassword
      });
      setShowCreateModal(false);
      setNewUser({
        email: "",
        role: "employee",
        firstName: "",
        lastName: "",
        department: "",
        position: ""
      });
      toast.success("User created successfully.");
      await loadUsers();
    } catch (error) {
      console.error("Failed to create user:", error);
      toast.error(error.response?.data?.error || "Failed to create user.");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (selectedUser) => {
    if (!window.confirm(`Delete ${selectedUser.username || selectedUser.email}?`)) {
      return;
    }

    try {
      await adminAPI.deleteUser(selectedUser.id);
      toast.success("User deleted successfully.");
      await loadUsers();
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error(error.response?.data?.error || "Failed to delete user.");
    }
  };

  const handleRoleCycle = async (selectedUser) => {
    const roleOrder = ["employee", "hr", "admin"];
    const nextRole = roleOrder[(roleOrder.indexOf(selectedUser.role) + 1) % roleOrder.length];

    try {
      await adminAPI.updateUserRole(selectedUser.id, { role: nextRole });
      toast.success(`Role updated to ${roleLabels[nextRole]}.`);
      await loadUsers();
    } catch (error) {
      console.error("Failed to update role:", error);
      toast.error(error.response?.data?.error || "Failed to update role.");
    }
  };

  return (
    <div className="tenant-users">
      <section className="tenant-users-hero">
        <div>
          <p className="tenant-users-kicker">Tenant user management</p>
          <h2>Provision and govern access without self-registration.</h2>
          <p>
            Accounts in this workspace are scoped to your tenant. Super admins can create users,
            rotate roles, and hand over temporary credentials for first login.
          </p>
        </div>
        {isSuperAdmin && (
          <button type="button" className="primary-cta" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            Add user
          </button>
        )}
      </section>

      <section className="user-summary-grid">
        <article className="summary-card">
          <Users size={18} />
          <div>
            <span>Total users</span>
            <strong>{summary.total}</strong>
          </div>
        </article>
        <article className="summary-card">
          <Shield size={18} />
          <div>
            <span>Admins</span>
            <strong>{summary.admins}</strong>
          </div>
        </article>
        <article className="summary-card">
          <UserCheck size={18} />
          <div>
            <span>HR</span>
            <strong>{summary.hr}</strong>
          </div>
        </article>
        <article className="summary-card">
          <Mail size={18} />
          <div>
            <span>Employees</span>
            <strong>{summary.employees}</strong>
          </div>
        </article>
      </section>

      {createdCredentials && (
        <section className="credentials-banner">
          <div>
            <h3>Temporary credentials generated</h3>
            <p>Share these once, then ask the user to change password after login.</p>
          </div>
          <div className="credentials-grid">
            <span>Email: {createdCredentials.email}</span>
            <span>Username: {createdCredentials.username}</span>
            <span>Password: {createdCredentials.temporaryPassword}</span>
          </div>
        </section>
      )}

      <section className="user-toolbar">
        <div className="toolbar-search">
          <input
            type="text"
            placeholder="Search by email or username"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <label className="role-filter">
            <Filter size={16} />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="hr">HR</option>
              <option value="employee">Employee</option>
            </select>
          </label>
          <button type="button" className="secondary-cta" onClick={loadUsers}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      <section className="user-table-shell">
        {loading ? (
          <div className="empty-state">Loading tenant users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">No users match the current filter.</div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-chip">
                          {(entry.username || entry.email.charAt(0)).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong>{entry.username || entry.email.split("@")[0]}</strong>
                          <span>Tenant-scoped account</span>
                        </div>
                      </div>
                    </td>
                    <td>{entry.email}</td>
                    <td>
                      <span className={`role-pill role-${entry.role}`}>
                        {roleLabels[entry.role] || entry.role}
                      </span>
                    </td>
                    <td>{new Date(entry.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="row-btn" onClick={() => toast(`User ID: ${entry.id}`)}>
                          <Eye size={15} />
                        </button>
                        {isSuperAdmin && entry.role !== "super_admin" && (
                          <>
                            <button type="button" className="row-btn" onClick={() => handleRoleCycle(entry)}>
                              <Shield size={15} />
                            </button>
                            <button type="button" className="row-btn danger" onClick={() => handleDeleteUser(entry)}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isSuperAdmin && showCreateModal && (
        <div className="user-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="user-modal-header">
              <div>
                <h3>Create tenant user</h3>
                <p>New users automatically inherit the current tenant boundary.</p>
              </div>
              <button type="button" className="secondary-cta" onClick={() => setShowCreateModal(false)}>
                Close
              </button>
            </div>

            <div className="user-form-grid">
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                />
              </label>
              <label>
                Role
                <select
                  name="role"
                  value={newUser.role}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
                >
                  <option value="employee">Employee</option>
                  <option value="hr">HR</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                First name
                <input
                  type="text"
                  name="firstName"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, firstName: e.target.value }))}
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  name="lastName"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </label>
              <label>
                Department
                <input
                  type="text"
                  name="department"
                  value={newUser.department}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, department: e.target.value }))}
                />
              </label>
              <label>
                Position
                <input
                  type="text"
                  name="position"
                  value={newUser.position}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, position: e.target.value }))}
                />
              </label>
            </div>

            <div className="user-modal-footer">
              <button type="button" className="secondary-cta" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="button" className="primary-cta" disabled={creatingUser} onClick={handleCreateUser}>
                {creatingUser ? "Creating..." : "Create user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
