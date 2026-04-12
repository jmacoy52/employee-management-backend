import React from "react";
import AdminNav from "./AdminNav";
import "./AdminLayout.css";

const AdminLayout = ({ children, title, subtitle, showNav = true }) => {
  return (
    <div className="admin-layout">
      {showNav && <AdminNav />}
      <div className="admin-content">
        <div className="page-header">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
