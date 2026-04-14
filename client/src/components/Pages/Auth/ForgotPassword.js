import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import './ForgotPassword.css';

const ForgotPassword = () => {
  const [formData, setFormData] = useState({
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/api/admin/request-password-reset', {
        email: formData.email
      });

      if (response.data.success) {
        setSubmitted(true);
        toast.success('Password reset request submitted successfully');
      } else {
        toast.error(response.data.error || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      toast.error(error.response?.data?.error || 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="forgot-password-container">
        <div className="success-message">
          <div className="success-icon">✉</div>
          <h2>Reset Request Submitted</h2>
          <p>
            If an account exists for <strong>{formData.email}</strong>, you will receive 
            password reset instructions. Please check your email.
          </p>
          <p className="note">
            Note: Password resets require super admin approval and may take up to 24 hours.
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="btn-back"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-password-container">
      <div className="forgot-header">
        <div className="logo-section">
          <div className="logo">
            <div className="logo-icon">🏢</div>
            <h1 className="logo-text">EmploCore</h1>
          </div>
          <p className="logo-subtitle">Password Reset</p>
        </div>
      </div>
      
      <div className="forgot-form-container">
        <h2>Request Password Reset</h2>
        <p className="description">
          Enter your email address to request a password reset. The request will be 
          sent to the super admin for approval.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email address"
              required
              className="form-input"
            />
          </div>
          
          <button
            type="submit"
            className="btn-submit"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Request Reset'}
          </button>
        </form>
        
        <div className="back-link">
          <button 
            onClick={() => navigate('/login')}
            className="btn-back"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;