import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./Header.css";

const Header = () => {
  const [showHelp, setShowHelp] = useState(false);

  const toggleHelp = () => {
    setShowHelp(!showHelp);
  };

  return (
    <>
      <header className="header">
        <div className="logo">
          <h2>EmploCore</h2>
        </div>
        <nav className="navbar">
          <button onClick={toggleHelp} className="help-btn">Help</button>
          <Link to="/login" className="signin">Sign In</Link>
        </nav>
      </header>

      {showHelp && (
        <div className="help-modal">
          <div className="help-content">
            <h3>Help & Support</h3>
            <div className="help-sections">
              <div className="help-section">
                <h4>Getting Started</h4>
                <p>Welcome to EmploCore! To get started, register an account or sign in if you already have one.</p>
              </div>
              <div className="help-section">
                <h4>User Roles</h4>
                <ul>
                  <li><strong>Admin:</strong> Full access to user management, audit logs, and HR functions.</li>
                  <li><strong>HR:</strong> Manage employees, view profiles, and access HR dashboard.</li>
                  <li><strong>Employee:</strong> View personal information and company resources.</li>
                </ul>
              </div>
              <div className="help-section">
                <h4>Features</h4>
                <ul>
                  <li>Secure role-based access control</li>
                  <li>Employee management system</li>
                  <li>User profile management</li>
                  <li>Audit logging for security</li>
                  <li>Responsive dashboards</li>
                </ul>
              </div>
              <div className="help-section">
                <h4>Need More Help?</h4>
                <p>Contact your system administrator or refer to the <a href="https://docs.google.com/document/d/1pUthuDwy0-GOIGQ5uUa88VbBpJwvW4poGGqxuwasj10/edit?usp=sharing" target="_blank" rel="noopener noreferrer">documentation</a>.</p>
              </div>
            </div>
            <button onClick={toggleHelp} className="close-help">Close</button>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;


// This Header component serves as the top navigation bar for the application.
