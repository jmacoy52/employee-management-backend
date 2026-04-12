import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, UserCircle, LogOut, Home, ArrowLeft } from "lucide-react";
import "./HRNav.css";

const HRNav = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const switchToAdmin = () => {
    navigate("/AdminDashboard");
  };

  return (
    <nav className="hr-nav">
      <div className="nav-center">
        <ul className="nav-menu">
          <li onClick={() => navigate("/HRDashboard")}><Home size={18}/> Dashboard</li>
          <li onClick={() => navigate("/hr/employees")}><Users size={18}/> Employee List</li>
          <li onClick={() => navigate("/hr/create-employee")}><Plus size={18}/> Add Employee</li>
          <li onClick={() => navigate("/hr/profile")}><UserCircle size={18}/> My Profile</li>
        </ul>
      </div>
      <div className="nav-right">
        {user?.role === "admin" && (
          <button className="switch-btn" onClick={switchToAdmin}><ArrowLeft size={18}/> Back to Admin</button>
        )}
        <button className="logout-btn" onClick={logout}><LogOut size={18}/> Logout</button>
      </div>
    </nav>
  );
};

export default HRNav;
