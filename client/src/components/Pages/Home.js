import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogIn, ShieldCheck, AlertCircle, Users } from "lucide-react";
import "./Home.css";

const Home = () => {
  const navigate = useNavigate();
  const [systemStatus, setSystemStatus] = useState({
    isInitialized: false,
    loading: true,
    error: null
  });

  const checkSystemStatus = useCallback(async () => {
    try {
      console.log('🔍 Checking system status...');
      const response = await fetch("http://localhost:5000/api/system/status");
      const data = await response.json();
      
      console.log('📊 System status response:', data);
      
      setSystemStatus({
        isInitialized: data.isInitialized,
        loading: false,
        error: null
      });

      // If system is not initialized, redirect to setup
      if (!data.isInitialized) {
        console.log('🔄 System not initialized, redirecting to account creation...');
        navigate("/account-creation");
      } else {
        console.log('✅ System already initialized, showing login form');
      }
    } catch (err) {
      console.error('❌ Error checking system status:', err);
      setSystemStatus({
        isInitialized: false,
        loading: false,
        error: "Unable to connect to system"
      });
    }
  }, [navigate]);

  useEffect(() => {
    checkSystemStatus();
  }, [checkSystemStatus]);

  if (systemStatus.loading) {
    return (
      <div className="system-home">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Checking system status...</p>
        </div>
      </div>
    );
  }

  if (systemStatus.error) {
    return (
      <div className="system-home">
        <div className="error-container">
          <AlertCircle size={48} className="error-icon" />
          <h2>System Connection Error</h2>
          <p>{systemStatus.error}</p>
          <button onClick={checkSystemStatus} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!systemStatus.isInitialized) {
    // This will redirect to setup, but show a brief message
    return (
      <div className="system-home">
        <div className="redirect-container">
          <ShieldCheck size={48} className="setup-icon" />
          <h2>System Setup Required</h2>
          <p>Redirecting to system initialization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="system-home">
      <div className="login-container">
        <div className="login-card">
          <div className="logo-section">
            <h1 className="system-logo">
              Emplo<span className="logo-accent">Core</span>
            </h1>
            <p className="system-tagline">Workforce Management System</p>
          </div>

          <div className="login-section">
            <h2 className="login-title">System Login</h2>
            <p className="login-subtitle">Enter your credentials to access the system</p>

            <div className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="Enter your email"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Enter your password"
                  className="form-input"
                />
              </div>

              <button 
                onClick={() => navigate("/login")}
                className="login-btn"
              >
                <LogIn size={20} className="btn-icon" />
                Sign In
              </button>
            </div>

            <div className="login-info">
              <div className="info-item">
                <ShieldCheck size={16} className="info-icon" />
                <span>System will automatically detect your role</span>
              </div>
              <div className="info-item">
                <Users size={16} className="info-icon" />
                <span>Contact your administrator for account access</span>
              </div>
            </div>

            <div className="login-footer">
              <p>Need help accessing your account?</p>
              <Link to="/contact" className="help-link">
                Contact Support
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
