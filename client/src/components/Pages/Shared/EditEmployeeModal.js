import React, { useEffect, useState } from "react";
import axios from "axios";
import Modal from "./Modal";
import "../Shared/EmployeeForm.css";
import toast from "react-hot-toast";
import {
  User,
  Mail,
  Briefcase,
  Building2,
  Save,
  X
} from "lucide-react";

const EditEmployeeModal = ({ open, onClose, employee, onUpdated }) => {
  const [form, setForm] = useState({
    FullName: "",
    email: "",
    position: "",
    Department: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (employee) {
      setForm({
        FullName: employee.FullName ?? "",
        email: employee.email ?? "",
        position: employee.position ?? "",
        Department: employee.Department ?? "",
      });
      
      // Clear any existing errors when loading new employee data
      setError("");
    }
  }, [employee]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setError("");
    }
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `http://localhost:5000/api/employees/${employee.id}`,
        { ...form },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Employee updated successfully!");
      onUpdated();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.msg || "Update failed.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Edit Employee Info">
      <div className="edit-employee-form">
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="error-message">
              <X size={16} />
              <span>{error}</span>
            </div>
          )}

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
                value={form.FullName}
                onChange={handleChange}
                className="input-field-compact"
                placeholder="John Doe"
              />
            </div>

            {/* Email */}
            <div className="form-field-compact">
              <label htmlFor="email" className="field-label-compact">
                <Mail size={14} />
                Email
              </label>
              <input
                id="email"
                type="text"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="input-field-compact"
                placeholder="john@company.com"
              />
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
                value={form.position}
                onChange={handleChange}
                className="input-field-compact"
                placeholder="Software Engineer"
              />
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
                value={form.Department}
                onChange={handleChange}
                className="input-field-compact"
                placeholder="Enter department name"
              />
            </div>

            
            {/* Empty cell for grid alignment */}
            <div className="form-field-compact"></div>
          </div>

          {/* Form Actions Footer */}
          <div className="form-footer-compact">
            <button type="button" onClick={onClose} className="btn-compact btn-secondary">
              <X size={14} />
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-compact btn-primary">
              <Save size={14} />
              {isSubmitting ? 'Updating...' : 'Update Employee'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default EditEmployeeModal;
