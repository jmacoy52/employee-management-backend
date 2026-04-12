import React, { useState } from "react";
import axios from "axios";
import "../Shared/EmployeeForm.css";
import toast from "react-hot-toast";
import {
  User,
  Mail,
  Briefcase,
  Building2,
  Save,
  X,
  AlertCircle,
  Calendar,
  UserPlus
} from "lucide-react";

const EmployeeForm = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    FullName: "",
    email: "",
    position: "",
    Department: "",
    start_date: new Date().toISOString().split('T')[0],
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  
  const validateField = (name, value) => {
    const newErrors = { ...errors };

    switch (name) {
      case 'FullName':
        if (!value.trim()) {
          newErrors.FullName = 'Full name is required';
        } else if (value.trim().length < 2) {
          newErrors.FullName = 'Full name must be at least 2 characters';
        } else {
          delete newErrors.FullName;
        }
        break;
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value.trim()) {
          newErrors.email = 'Email is required';
        } else if (!emailRegex.test(value)) {
          newErrors.email = 'Please enter a valid email address';
        } else {
          delete newErrors.email;
        }
        break;
      case 'position':
        if (!value.trim()) {
          newErrors.position = 'Position is required';
        } else {
          delete newErrors.position;
        }
        break;
      case 'Department':
        if (!value.trim()) {
          newErrors.Department = 'Department is required';
        } else {
          delete newErrors.Department;
        }
        break;
      default:
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    if (touched[name]) {
      validateField(name, value);
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({
      ...prev,
      [name]: true
    }));
    
    validateField(name, value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mark all fields as touched
    const allTouched = {};
    Object.keys(formData).forEach(key => {
      allTouched[key] = true;
    });
    setTouched(allTouched);

    // Validate all fields
    let isValid = true;
    Object.keys(formData).forEach(key => {
      if (!validateField(key, formData[key])) {
        isValid = false;
      }
    });

    if (!isValid) {
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      ...formData,
    };

    try {
      const token = localStorage.getItem("token");
      await axios.post("http://localhost:5000/api/employees", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Employee created successfully!');
      onSuccess();
    } catch (err) {
      const errorMsg = err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || "Failed to create employee.";
      toast.error(errorMsg);
      setErrors({ submit: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="employee-form-page">
      {/* Header */}
      <div className="form-header">
        <div className="header-left">
          <div className="header-icon">
            <UserPlus size={20} />
          </div>
          <div className="header-text">
            <h1 className="header-title">Add New Employee</h1>
            <p className="header-subtitle">Enter the employee information to get started</p>
          </div>
        </div>
        <button type="button" onClick={onCancel} className="close-button">
          <X size={16} />
        </button>
      </div>

      {/* Error Message */}
      {errors.submit && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{errors.submit}</span>
        </div>
      )}

      {/* Compact Form */}
      <form className="employee-form" onSubmit={handleSubmit}>
        <div className="form-body">
          <div className="form-grid-compact">
            {/* Full Name */}
            <div className="form-field-compact">
              <label htmlFor="FullName" className="field-label-compact">
                <User size={14} />
                Full Name
              </label>
              <input
                id="FullName"
                type="text"
                name="FullName"
                value={formData.FullName}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`input-field-compact ${errors.FullName ? 'error' : ''}`}
                placeholder="John Doe"
              />
              {errors.FullName && <div className="error-text-compact">{errors.FullName}</div>}
            </div>

            {/* Email */}
            <div className="form-field-compact">
              <label htmlFor="email" className="field-label-compact">
                <Mail size={14} />
                Email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`input-field-compact ${errors.email ? 'error' : ''}`}
                placeholder="john@company.com"
              />
              {errors.email && <div className="error-text-compact">{errors.email}</div>}
            </div>

            {/* Position */}
            <div className="form-field-compact">
              <label htmlFor="position" className="field-label-compact">
                <Briefcase size={14} />
                Position
              </label>
              <input
                id="position"
                type="text"
                name="position"
                value={formData.position}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`input-field-compact ${errors.position ? 'error' : ''}`}
                placeholder="Software Engineer"
              />
              {errors.position && <div className="error-text-compact">{errors.position}</div>}
            </div>

            {/* Department */}
            <div className="form-field-compact">
              <label htmlFor="Department" className="field-label-compact">
                <Building2 size={14} />
                Department
              </label>
              <input
                id="Department"
                type="text"
                name="Department"
                value={formData.Department}
                onChange={handleChange}
                onBlur={handleBlur}
                className={`input-field-compact ${errors.Department ? 'error' : ''}`}
                placeholder="Enter department name"
              />
              {errors.Department && <div className="error-text-compact">{errors.Department}</div>}
            </div>

            
            {/* Start Date */}
            <div className="form-field-compact">
              <label htmlFor="start_date" className="field-label-compact">
                <Calendar size={14} />
                Start Date
              </label>
              <input
                id="start_date"
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                onBlur={handleBlur}
                className="input-field-compact"
              />
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="form-footer-compact">
            <button type="button" onClick={onCancel} className="btn-compact btn-secondary">
              <X size={14} />
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-compact btn-primary">
              <Save size={14} />
              {isSubmitting ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EmployeeForm;
