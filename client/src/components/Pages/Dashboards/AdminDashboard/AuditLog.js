import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Filter, RefreshCw, ScrollText } from "lucide-react";
import { adminAPI } from "../../../../services/apiService";
import "./AdminDashboard.css";

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getAuditLogs();
      setLogs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load audit logs:", error);
      toast.error(error.response?.data?.error || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const action = log.action || "";
      const description = log.description || "";
      const matchesSearch =
        !searchTerm ||
        action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesFilter = actionFilter === "all" || action === actionFilter;
      return matchesSearch && matchesFilter;
    });
  }, [logs, searchTerm, actionFilter]);

  const actions = Array.from(new Set(logs.map((log) => log.action).filter(Boolean)));

  return (
    <div className="admin-content-card">
      <div className="admin-content-header">
        <div>
          <h2>Tenant audit log</h2>
          <p>Every tenant-scoped action recorded by the backend appears here.</p>
        </div>
        <button type="button" className="admin-content-btn" onClick={loadLogs}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="admin-content-toolbar">
        <input
          type="text"
          placeholder="Search actions or descriptions"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <label className="admin-filter-select">
          <Filter size={16} />
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="admin-empty-state">Loading tenant audit history...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="admin-empty-state">
          <ScrollText size={22} />
          <span>No audit entries match the current filter.</span>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Description</th>
                <th>When</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.action}</td>
                  <td>{log.description}</td>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.ip_address || "n/a"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
