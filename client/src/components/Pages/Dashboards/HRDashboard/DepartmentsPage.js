import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  ChevronLeft,
  Plus,
  TrendingUp,
  DollarSign,
  BarChart3
} from "lucide-react";
import { hrAPI } from "../../../../services/apiService";
import { useAuth } from "../../../../contexts/AuthContext";
import "./DepartmentsPage.css";
import toast from "react-hot-toast";

const DepartmentsPage = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchDepartments = async () => {
    // Early return if no user
    if (!user) return;
    
    try {
      setLoading(true);
      const res = await hrAPI.getEmployees();
      const employeeData = Array.isArray(res.data.employees) ? res.data.employees : [];
      
      // Group employees by department
      const deptData = {};
      employeeData.forEach(emp => {
        if (emp.Department) {
          if (!deptData[emp.Department]) {
            deptData[emp.Department] = {
              name: emp.Department,
              employees: [],
              totalSalary: 0,
              avgSalary: 0
            };
          }
          deptData[emp.Department].employees.push(emp);
          deptData[emp.Department].totalSalary += parseFloat(emp.salary || 0);
        }
      });

      // Calculate averages
      Object.values(deptData).forEach(dept => {
        dept.avgSalary = dept.employees.length > 0 ? dept.totalSalary / dept.employees.length : 0;
      });

      setDepartments(Object.values(deptData));
    } catch (err) {
      console.error("Error fetching departments:", err);
      toast.error("Failed to load departments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, [user]);

  return (
    <div className="departments-page">
      <div className="page-header">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={() => navigate("/HRDashboard")}
          >
            <ChevronLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="header-title">Departments Overview</h1>
        </div>
      </div>

      <div className="departments-container">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading departments...</p>
          </div>
        ) : departments.length === 0 ? (
          <div className="empty-state">
            <Building2 size={48} className="text-gray-400" />
            <h3>No departments found</h3>
            <p>Start by adding employees to different departments.</p>
          </div>
        ) : (
          <div className="departments-grid">
            {departments.map((dept, index) => (
              <div key={index} className="department-card">
                <div className="department-header">
                  <div className="department-icon">
                    <Building2 size={24} />
                  </div>
                  <h3>{dept.name}</h3>
                </div>
                
                <div className="department-stats">
                  <div className="stat-item">
                    <Users size={16} className="stat-icon" />
                    <div>
                      <span className="stat-number">{dept.employees.length}</span>
                      <span className="stat-label">Employees</span>
                    </div>
                  </div>
                  
                  <div className="stat-item">
                    <DollarSign size={16} className="stat-icon" />
                    <div>
                      <span className="stat-number">${dept.avgSalary.toFixed(0)}</span>
                      <span className="stat-label">Avg Salary</span>
                    </div>
                  </div>
                  
                  <div className="stat-item">
                    <BarChart3 size={16} className="stat-icon" />
                    <div>
                      <span className="stat-number">${dept.totalSalary.toFixed(0)}</span>
                      <span className="stat-label">Total Salary</span>
                    </div>
                  </div>
                </div>

                <div className="department-actions">
                  <button 
                    className="view-btn"
                    onClick={() => navigate("/hr/employees")}
                  >
                    View Employees
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentsPage;
