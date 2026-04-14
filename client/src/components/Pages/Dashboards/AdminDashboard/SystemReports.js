import React from "react";
import { BarChart3, Users, UserCheck } from "lucide-react";
import "./AdminDashboard.css";

const SystemReports = () => {
  return (
    <div className="admin-content-card">
      <div className="admin-content-header">
        <div>
          <h2>Reports workspace</h2>
          <p>Tenant-facing reporting is being prepared around the real backend data you already collect.</p>
        </div>
      </div>

      <div className="admin-report-grid">
        <article className="admin-report-card">
          <Users size={20} />
          <h3>User distribution</h3>
          <p>Track tenant account counts and role spread without exposing other tenants.</p>
        </article>
        <article className="admin-report-card">
          <UserCheck size={20} />
          <h3>HR operations</h3>
          <p>Review creation, edits, and deletions once employee report views are expanded.</p>
        </article>
        <article className="admin-report-card">
          <BarChart3 size={20} />
          <h3>Readiness</h3>
          <p>This surface is now consistent with the admin shell and ready for the next reporting API pass.</p>
        </article>
      </div>
    </div>
  );
};

export default SystemReports;
