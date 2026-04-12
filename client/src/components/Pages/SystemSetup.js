import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ShieldCheck, Users, AlertCircle, CheckCircle } from "lucide-react";
import "./SystemSetup.css";

const SystemSetup = () => {
  const navigate = useNavigate();
  const [isFirstSetup, setIsFirstSetup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    superAdminEmail: "",
    superAdminPassword: "",
    superAdminConfirmPassword: "",
    companyName: "",
    adminEmail: "",
    adminPassword: "",
    adminConfirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const checkSystemStatus = useCallback(async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/system/status");
      setIsFirstSetup(response.data.isFirstSetup);
      if (!response.data.isFirstSetup) {
        navigate("/login");
      }
    } catch (err) {
      console.error("Error checking system status:", err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    checkSystemStatus();
  }, [checkSystemStatus]);

  const validateStep1 = () => {
    const newErrors = {};
    
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

    if (!formData.companyName.trim()) {
      newErrors.companyName = "Company name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};
    
    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = "Admin email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      newErrors.adminEmail = "Please enter a valid email address";
    }
    
    if (formData.adminEmail === formData.superAdminEmail) {
      newErrors.adminEmail = "Admin email must be different from Super Admin email";
    }
    
    if (!formData.adminPassword) {
      newErrors.adminPassword = "Password is required";
    } else if (formData.adminPassword.length < 8) {
      newErrors.adminPassword = "Password must be at least 8 characters";
    }
    
    if (formData.adminPassword !== formData.adminConfirmPassword) {
      newErrors.adminConfirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ""
      }));
    }
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handlePreviousStep = () => {
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep2()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await axios.post("http://localhost:5000/api/system/initialize", {
        superAdmin: {
          email: formData.superAdminEmail,
          password: formData.superAdminPassword,
        },
        admin: {
          email: formData.adminEmail,
          password: formData.adminPassword,
        },
        companyName: formData.companyName,
      });

      if (response.data.success) {
        // System initialized successfully, redirect to login
        navigate("/login");
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || "Failed to initialize system";
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
            <p className="system-tagline">System Initialization</p>
          </div>
          
          <div className="progress-indicator">
            <div className={`step ${step >= 1 ? 'active' : ''}`}>
              <div className="step-number">1</div>
              <div className="step-label">Super Admin</div>
            </div>
            <div className={`step ${step >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">Admin Setup</div>
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
            {step === 1 && (
              <div className="setup-step">
                <div className="step-header">
                  <ShieldCheck size={32} className="step-icon" />
                  <div>
                    <h2>Create Super Admin Account</h2>
                    <p>The Super Admin account has system-wide control and can manage all aspects of the system.</p>
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
                      className={`form-input ${errors.companyName ? 'error' : ''}`}
                      placeholder="Enter company name"
                    />
                    {errors.companyName && <div className="error-text">{errors.companyName}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="superAdminEmail">Super Admin Email</label>
                    <input
                      type="email"
                      id="superAdminEmail"
                      name="superAdminEmail"
                      value={formData.superAdminEmail}
                      onChange={handleInputChange}
                      className={`form-input ${errors.superAdminEmail ? 'error' : ''}`}
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
                      className={`form-input ${errors.superAdminPassword ? 'error' : ''}`}
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
                      className={`form-input ${errors.superAdminConfirmPassword ? 'error' : ''}`}
                      placeholder="Confirm password"
                    />
                    {errors.superAdminConfirmPassword && <div className="error-text">{errors.superAdminConfirmPassword}</div>}
                  </div>
                </div>

                <div className="step-actions">
                  <button type="button" onClick={handleNextStep} className="btn-primary">
                    Next Step
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="setup-step">
                <div className="step-header">
                  <Users size={32} className="step-icon" />
                  <div>
                    <h2>Create Admin Account</h2>
                    <p>The Admin account will manage users, departments, and day-to-day system operations.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="adminEmail">Admin Email</label>
                    <input
                      type="email"
                      id="adminEmail"
                      name="adminEmail"
                      value={formData.adminEmail}
                      onChange={handleInputChange}
                      className={`form-input ${errors.adminEmail ? 'error' : ''}`}
                      placeholder="admin@company.com"
                    />
                    {errors.adminEmail && <div className="error-text">{errors.adminEmail}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="adminPassword">Password</label>
                    <input
                      type="password"
                      id="adminPassword"
                      name="adminPassword"
                      value={formData.adminPassword}
                      onChange={handleInputChange}
                      className={`form-input ${errors.adminPassword ? 'error' : ''}`}
                      placeholder="Enter password (min 8 characters)"
                    />
                    {errors.adminPassword && <div className="error-text">{errors.adminPassword}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="adminConfirmPassword">Confirm Password</label>
                    <input
                      type="password"
                      id="adminConfirmPassword"
                      name="adminConfirmPassword"
                      value={formData.adminConfirmPassword}
                      onChange={handleInputChange}
                      className={`form-input ${errors.adminConfirmPassword ? 'error' : ''}`}
                      placeholder="Confirm password"
                    />
                    {errors.adminConfirmPassword && <div className="error-text">{errors.adminConfirmPassword}</div>}
                  </div>
                </div>

                <div className="setup-summary">
                  <h3>Setup Summary</h3>
                  <div className="summary-item">
                    <CheckCircle size={16} className="icon-success" />
                    <span>Company: {formData.companyName}</span>
                  </div>
                  <div className="summary-item">
                    <CheckCircle size={16} className="icon-success" />
                    <span>Super Admin: {formData.superAdminEmail}</span>
                  </div>
                  <div className="summary-item">
                    <CheckCircle size={16} className="icon-success" />
                    <span>Admin: {formData.adminEmail}</span>
                  </div>
                </div>

                <div className="step-actions">
                  <button type="button" onClick={handlePreviousStep} className="btn-secondary">
                    Previous
                  </button>
                  <button type="submit" disabled={isSubmitting} className="btn-primary">
                    {isSubmitting ? 'Initializing...' : 'Complete Setup'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default SystemSetup;
