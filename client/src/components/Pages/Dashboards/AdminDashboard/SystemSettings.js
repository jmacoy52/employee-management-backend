import React from "react";
import { Database, Shield, Bell } from "lucide-react";
import "./AdminDashboard.css";

const SystemSettings = () => {
  return (
    <div className="admin-content-card">
      <div className="admin-content-header">
        <div>
          <h2>Tenant settings</h2>
          <p>Core safeguards now live in the backend: tenant boundaries, scoped notifications, and isolated user records.</p>
        </div>
      </div>

      <div className="admin-report-grid">
        <article className="admin-report-card">
          <Shield size={20} />
          <h3>Isolation model</h3>
          <p>Users, employees, audit logs, and notifications are being scoped by tenant identifiers.</p>
        </article>
        <article className="admin-report-card">
          <Bell size={20} />
          <h3>Notification routing</h3>
          <p>Admin and HR notification buttons now target real routes instead of static visual badges.</p>
        </article>
        <article className="admin-report-card">
          <Database size={20} />
          <h3>Schema readiness</h3>
          <p>Startup schema checks prepare tenant and notification storage without relying on sample records.</p>
        </article>
      </div>
    </div>
  );
};

export default SystemSettings;
