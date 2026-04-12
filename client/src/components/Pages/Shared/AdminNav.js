import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, Settings, ScrollText, UserCheck, LogOut, Home } from "lucide-react";
import "./AdminNav.css";

const AdminNav = () => {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  return (
    <nav className="admin-nav">
      <div className="nav-center">
        <ul className="nav-menu">
          <li onClick={() => navigate("/AdminDashboard")}><Home size={18}/> Dashboard</li>
          <li onClick={() => navigate("/admin/users")}><Users size={18}/> View Users</li>
          <li onClick={() => navigate("/admin/usermanagement")}><Settings size={18}/> User Management</li>
          <li onClick={() => navigate("/admin/auditlog")}><ScrollText size={18}/> Audit Log</li>
          <li onClick={() => navigate("/admin/hr")}><UserCheck size={18}/> HR Dashboard</li>
        </ul>
      </div>
      <button className="logout-btn" onClick={logout}><LogOut size={18}/> Logout</button>
    </nav>
  );
};

export default AdminNav;
