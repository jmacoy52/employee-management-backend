import React, { useEffect, useState } from "react";
import "./EmployeeListPage.css";
import EmployeeList from "../../Shared/EmployeeList";
import HRNav from "../../Shared/HRNav";
import Modal from "../../Shared/Modal";
import {
  ArrowLeft, Users, Plus, Search, Filter, Briefcase, Save, User, X, TrendingUp, Building
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { hrAPI } from "../../../../services/apiService";
import { useAuth } from "../../../../contexts/AuthContext";
import toast from "react-hot-toast";

const EmployeeListPage = () => {
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    FullName: "",
    position: "",
    Department: "",
    salary: "",
  });
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchEmployees = async () => {
    // Early return if no user
    if (!user) return;
    
    try {
      setLoading(true);
      const res = await hrAPI.getEmployees();
      const employeeData = Array.isArray(res.data.employees) ? res.data.employees : [];
      setEmployees(employeeData);
      setFilteredEmployees(employeeData);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setEmployees([]);
      setFilteredEmployees([]);
      toast.error("Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [user]); // Depend on user to refetch when user changes

  // Filter employees based on search and department
  useEffect(() => {
    let filtered = employees;

    if (searchTerm) {
      filtered = filtered.filter(employee =>
        employee.FullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        employee.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (departmentFilter) {
      filtered = filtered.filter(employee => employee.Department === departmentFilter);
    }

    setFilteredEmployees(filtered);
  }, [searchTerm, departmentFilter, employees]);

  const departments = [...new Set(employees.map(emp => emp.Department))];

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      FullName: employee.FullName,
      position: employee.position,
      Department: employee.Department,
      salary: employee.salary,
    });
    setIsModalOpen(true);
  };

  const handleUpdate = async () => {
    // Early validation
    if (!editingEmployee?.id || !formData.FullName?.trim()) {
      toast.error("Invalid employee data");
      return;
    }

    try {
      await hrAPI.updateEmployee(editingEmployee.id, {
        FullName: formData.FullName.trim(),
        position: formData.position.trim(),
        Department: formData.Department.trim(),
        salary: formData.salary
      });
      toast.success("Employee updated successfully!");
      setIsModalOpen(false);
      setEditingEmployee(null);
      fetchEmployees(); // Refresh list
    } catch (err) {
      console.error("Failed to update employee:", err);
      toast.error("Update failed.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this employee?")) return;
    
    try {
      await hrAPI.deleteEmployee(id);
      toast.success("Employee deleted successfully!");
      fetchEmployees(); // Refresh list
    } catch (err) {
      console.error("Failed to delete employee:", err);
      toast.error("Delete failed.");
    }
  };

  return (
    <div className="employee-list-page">
      <div className="page-header">
        <div className="header-content">
          <button
            className="back-button"
            onClick={() => navigate("/hr/dashboard")}
          >
            <ArrowLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="header-title">Employee Management</h1>
          <button
            className="btn-add"
            onClick={() => navigate("/hr/create-employee")}
          >
            <Plus size={20} />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      <div className="employee-list-container">
        {/* Filters and Search */}
        <div className="filters-section">
          <div className="search-container">
            <Search size={20} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search employees by name, position, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="department-filter">
            <select
              className="department-select"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="page-content">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading employees...</p>
            </div>
          ) : (
            <EmployeeList
              employees={filteredEmployees}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Edit Employee"
      >
        <form onSubmit={(e) => { e.preventDefault(); handleUpdate(); }} noValidate>
          <div className="form-group">
            <label htmlFor="editFullName">
              <User size={16} />
              Full Name
            </label>
            <input
              id="editFullName"
              type="text"
              value={formData.FullName}
              onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
              placeholder="Enter employee's full name"
              required
              className="modern-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="editPosition">
              <Briefcase size={16} />
              Position
            </label>
            <input
              id="editPosition"
              type="text"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              placeholder="Enter job position"
              required
              className="modern-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="editDepartment">
              <Building size={16} />
              Department
            </label>
            <select
              id="editDepartment"
              value={formData.Department}
              onChange={(e) => setFormData({ ...formData, Department: e.target.value })}
              required
              className="modern-select"
            >
              <option value="">Select Department</option>
              <option value="Engineering">Engineering</option>
              <option value="Marketing">Marketing</option>
              <option value="Sales">Sales</option>
              <option value="HR">Human Resources</option>
              <option value="Finance">Finance</option>
              <option value="Operations">Operations</option>
              <option value="IT">Information Technology</option>
              <option value="Customer Support">Customer Support</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="editSalary">
              <TrendingUp size={16} />
              Monthly Salary (₵)
            </label>
            <input
              id="editSalary"
              type="text"
              value={formData.salary}
              onChange={(e) => {
                const numericValue = e.target.value.replace(/[^0-9]/g, '');
                setFormData({ ...formData, salary: numericValue });
              }}
              placeholder="Enter amount"
              className="modern-input"
            />
          </div>
          <div className="form-actions">
            <button 
              type="button" 
              className="btn-secondary modern-btn" 
              onClick={() => setIsModalOpen(false)}
            >
              <X size={16} />
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary modern-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="spinner"></div>
                  Updating...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Update Employee
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default EmployeeListPage;
