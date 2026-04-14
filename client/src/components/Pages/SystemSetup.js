import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ShieldCheck, AlertCircle, CheckCircle } from "lucide-react";
import "./SystemSetup.css";

const SystemSetup = () => {
  const navigate = useNavigate();
  const [isFirstSetup, setIsFirstSetup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    companyName: "",
    superAdminUsername: "",
    superAdminEmail: "",
    superAdminPassword: "",
    superAdminConfirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkSystemStatus = useCallback(async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/system/status");
      const firstSetup = response.data.isFirstSetup ?? !response.data.isInitialized;
      setIsFirstSetup(firstSetup);

      if (!firstSetup) {
        navigate("/login");
      }
    } catch (err) {
      console.error("Error checking system status:", err);
      setErrors({ submit: "Unable to verify system state." });
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    checkSystemStatus();
  }, [checkSystemStatus]);

  const validateSetup = () => {
    const newErrors = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    }

    if (!formData.superAdminEmail.trim()) {
      newErrors.superAdminEmail = "Super Admin email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.superAdminEmail)) {
      newErrors.superAdminEmail = "Please enter a valid email address";
    }

    if (!formData.superAdminPassword) {
      newErrors.superAdminPassword = "Password is required";
    } else if (formData.superAdminPassword.length < 8) {
      newErrors.superAdminPassword = "Password must be at least 8 characters";
    }

    if (formData.superAdminPassword !== formData.superAdminConfirmPassword) {
      newErrors.superAdminConfirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateSetup()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.post("http://localhost:5000/api/system/initialize", {
        companyName: formData.companyName,
        superAdmin: {
          username: formData.superAdminUsername,
          email: formData.superAdminEmail,
          password: formData.superAdminPassword,
        },
      });

      if (response.data.success) {
        navigate("/login");
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to initialize system";
      setErrors({ submit: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="system-setup-loading">
        <div className="loading-spinner"></div>
        <p>Checking system status...</p>
      </div>
    );
  }

  if (!isFirstSetup) {
    return (
      <div className="system-setup-already-configured">
        <div className="message-card">
          <AlertCircle size={48} className="icon-warning" />
          <h2>System Already Configured</h2>
          <p>This system has already been set up. Please contact your system administrator.</p>
          <button onClick={() => navigate("/login")} className="btn-primary">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="system-setup">
      <div className="setup-container">
        <div className="setup-header">
          <div className="logo-section">
            <h1 className="system-logo">
              Emplo<span className="logo-accent">Core</span>
            </h1>
            <p className="system-tagline">System Setup</p>
          </div>

          <div className="progress-indicator">
            <div className="step active">
              <div className="step-number">1</div>
              <div className="step-label">Super Admin</div>
            </div>
          </div>
        </div>

        <div className="setup-content">
          {errors.submit && (
            <div className="error-message">
              <AlertCircle size={20} />
              <span>{errors.submit}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="setup-step">
              <div className="step-header">
                <ShieldCheck size={32} className="step-icon" />
                <div>
                  <h2>Create Super Admin Account</h2>
                  <p>This is the only setup account. After login, the Super Admin will create all other users.</p>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="companyName">Company Name</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    className={`form-input ${errors.companyName ? "error" : ""}`}
                    placeholder="Enter company name"
                  />
                  {errors.companyName && <div className="error-text">{errors.companyName}</div>}
                </div>

                <div className="form-group">
                  <label htmlFor="superAdminUsername">Username</label>
                  <input
                    type="text"
                    id="superAdminUsername"
                    name="superAdminUsername"
                    value={formData.superAdminUsername}
                    onChange={handleInputChange}
                    className="form-input"
                    placeholder="Optional username"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="superAdminEmail">Super Admin Email</label>
                  <input
                    type="email"
                    id="superAdminEmail"
                    name="superAdminEmail"
                    value={formData.superAdminEmail}
                    onChange={handleInputChange}
                    className={`form-input ${errors.superAdminEmail ? "error" : ""}`}
                    placeholder="superadmin@company.com"
                  />
                  {errors.superAdminEmail && <div className="error-text">{errors.superAdminEmail}</div>}
                </div>

                <div className="form-group">
                  <label htmlFor="superAdminPassword">Password</label>
                  <input
                    type="password"
                    id="superAdminPassword"
                    name="superAdminPassword"
                    value={formData.superAdminPassword}
                    onChange={handleInputChange}
                    className={`form-input ${errors.superAdminPassword ? "error" : ""}`}
                    placeholder="Enter password (min 8 characters)"
                  />
                  {errors.superAdminPassword && <div className="error-text">{errors.superAdminPassword}</div>}
                </div>

                <div className="form-group">
                  <label htmlFor="superAdminConfirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="superAdminConfirmPassword"
                    name="superAdminConfirmPassword"
                    value={formData.superAdminConfirmPassword}
                    onChange={handleInputChange}
                    className={`form-input ${errors.superAdminConfirmPassword ? "error" : ""}`}
                    placeholder="Confirm password"
                  />
                  {errors.superAdminConfirmPassword && <div className="error-text">{errors.superAdminConfirmPassword}</div>}
                </div>
              </div>

              <div className="setup-summary">
                <h3>Setup Summary</h3>
                <div className="summary-item">
                  <CheckCircle size={16} className="icon-success" />
                  <span>Company: {formData.companyName || "Not entered yet"}</span>
                </div>
                <div className="summary-item">
                  <CheckCircle size={16} className="icon-success" />
                  <span>Super Admin: {formData.superAdminEmail || "Not entered yet"}</span>
                </div>
              </div>

              <div className="step-actions">
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? "Initializing..." : "Complete Setup"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SystemSetup;
