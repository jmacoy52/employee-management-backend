import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  Activity,
  ArrowRight,
  Briefcase,
  Shield,
  Users,
  UserCheck
} from "lucide-react";
import { adminAPI, hrAPI } from "../../../services/apiService";
import { useAuth } from "../../../contexts/AuthContext";
import "./DashboardOverview.css";

const DashboardOverview = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    adminUsers: 0,
    hrUsers: 0,
    employeeUsers: 0,
    totalEmployees: 0
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [userStatsRes, employeesRes, activityRes] = await Promise.all([
          fetch("http://localhost:5000/api/users/stats", {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`
            }
          }).then((res) => res.json()),
          hrAPI.getEmployees(),
          adminAPI.getRecentActivities()
        ]);

        setStats({
          totalUsers: Number(userStatsRes.totalUsers || 0),
          adminUsers: Number(userStatsRes.adminUsers || 0),
          hrUsers: Number(userStatsRes.hrUsers || 0),
          employeeUsers: Number(userStatsRes.employeeUsers || 0),
          totalEmployees: Number(employeesRes.data?.pagination?.totalEmployees || employeesRes.data?.employees?.length || 0)
        });
        setRecentActivities(Array.isArray(activityRes.data) ? activityRes.data.slice(0, 5) : []);
      } catch (error) {
        console.error("Dashboard load failed:", error);
        toast.error("Failed to load dashboard insights.");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const cards = [
    {
      label: "Organization Users",
      value: stats.totalUsers,
      icon: Users,
      tone: "sky"
    },
    {
      label: "Administrators",
      value: stats.adminUsers,
      icon: Shield,
      tone: "amber"
    },
    {
      label: "HR Accounts",
      value: stats.hrUsers,
      icon: UserCheck,
      tone: "emerald"
    },
    {
      label: "Employees",
      value: stats.totalEmployees || stats.employeeUsers,
      icon: Briefcase,
      tone: "rose"
    }
  ];

  const actions = [
    {
      title: "Manage organization users",
      description: "Create admins, HR staff, and employee accounts with temporary passwords.",
      cta: "Open user management",
      onClick: () => navigate("/admin/users")
    },
    {
      title: "Review recent activity",
      description: "Inspect audit logs for onboarding, password changes, and organization operations.",
      cta: "Open audit log",
      onClick: () => navigate("/admin/auditlog")
    },
    {
      title: "View live alerts",
      description: "Track system and organization notifications without relying on sample data.",
      cta: "Open notifications",
      onClick: () => navigate("/admin/notifications")
    }
  ];

  if (loading) {
    return (
      <div className="overview-loading">
        <Activity className="spinner" size={28} />
        <p>Loading organization dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-overview">
      <section className="overview-hero">
        <div>
          <p className="overview-kicker">Organization control center</p>
          <h2>{user?.role === "super_admin" ? "Super Admin command view" : "Administrative overview"}</h2>
          <p>
            This workspace is scoped to your organization and surfaces the operational signals you need
            before inviting or managing more users.
          </p>
        </div>
      </section>

      <section className="stats-grid">
        {cards.map((card) => (
          <article key={card.label} className={`stat-card stat-card-${card.tone}`}>
            <div className="stat-icon">
              <card.icon size={22} />
            </div>
            <div className="stat-content">
              <p className="stat-label">{card.label}</p>
              <h3 className="stat-number">{card.value}</h3>
            </div>
          </article>
        ))}
      </section>

      <section className="overview-panels">
        <div className="panel-card">
          <div className="panel-header">
            <h3>Recent activity</h3>
            <button type="button" className="panel-link" onClick={() => navigate("/admin/auditlog")}>
              See all
            </button>
          </div>
          <div className="activity-list">
            {recentActivities.length === 0 ? (
              <p className="empty-copy">No organization activity has been recorded yet.</p>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className="activity-dot" />
                  <div>
                    <p className="activity-title">{activity.description || activity.action}</p>
                    <p className="activity-meta">
                      {activity.username || "System"} • {new Date(activity.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-header">
            <h3>Quick actions</h3>
          </div>
          <div className="quick-action-list">
            {actions.map((action) => (
              <button key={action.title} type="button" className="quick-action-card" onClick={action.onClick}>
                <div>
                  <h4>{action.title}</h4>
                  <p>{action.description}</p>
                </div>
                <span className="quick-action-link">
                  {action.cta}
                  <ArrowRight size={16} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardOverview;
