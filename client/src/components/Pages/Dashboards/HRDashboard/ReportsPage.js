import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  Download,
  ChevronLeft,
  DollarSign,
  FileText
} from "lucide-react";
import { hrAPI } from "../../../../services/apiService";
import { useAuth } from "../../../../contexts/AuthContext";
import "./ReportsPage.css";
import toast from "react-hot-toast";

const ReportsPage = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState("overview");
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchEmployees = useCallback(async () => {
    // Early return if no user
    if (!user) return;
    
    try {
      setLoading(true);
      const res = await hrAPI.getEmployees();
      const employeeData = Array.isArray(res.data.employees) ? res.data.employees : [];
      setEmployees(employeeData);
    } catch (err) {
      console.error("Error fetching employees for reports:", err);
      toast.error("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const calculateStats = () => {
    if (employees.length === 0) return null;

    const totalEmployees = employees.length;
    const departments = [...new Set(employees.map(emp => emp.Department))];
    const totalSalary = employees.reduce((sum, emp) => sum + parseFloat(emp.salary || 0), 0);
    const avgSalary = totalSalary / totalEmployees;

    const departmentStats = departments.map(dept => {
      const deptEmployees = employees.filter(emp => emp.Department === dept);
      const deptSalary = deptEmployees.reduce((sum, emp) => sum + parseFloat(emp.salary || 0), 0);
      return {
        name: dept,
        count: deptEmployees.length,
        avgSalary: deptSalary / deptEmployees.length,
        totalSalary: deptSalary
      };
    });

    return {
      totalEmployees,
      totalDepartments: departments.length,
      totalSalary,
      avgSalary,
      departmentStats
    };
  };

  const stats = calculateStats();

  const exportReport = () => {
    if (!stats) return;
    
    const reportData = {
      generatedAt: new Date().toISOString(),
      reportType: selectedReport,
      summary: {
        totalEmployees: stats.totalEmployees,
        totalDepartments: stats.totalDepartments,
        totalSalary: stats.totalSalary,
        averageSalary: stats.avgSalary
      },
      departments: stats.departmentStats
    };

    // Check if user wants Excel or JSON
    const useExcel = window.confirm("Export as Excel? (Click Cancel for JSON format)");
    
    if (useExcel) {
      exportToExcel(reportData);
    } else {
      exportToJSON(reportData);
    }
  };

  const exportToJSON = (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hr-report-${data.reportType}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("JSON report exported successfully");
  };

  const exportToExcel = (data) => {
    let csvContent = '';
    
    // Add header
    csvContent += 'HR Report\n';
    csvContent += `Generated: ${new Date(data.generatedAt).toLocaleString()}\n`;
    csvContent += `Report Type: ${data.reportType}\n\n`;
    
    // Add summary
    csvContent += 'Summary\n';
    csvContent += `Total Employees,${data.summary.totalEmployees}\n`;
    csvContent += `Total Departments,${data.summary.totalDepartments}\n`;
    csvContent += `Total Salary,${data.summary.totalSalary}\n`;
    csvContent += `Average Salary,${data.summary.averageSalary}\n\n`;
    
    // Add departments
    csvContent += 'Departments\n';
    csvContent += 'Department,Employee Count,Average Salary,Total Salary\n';
    
    data.departments.forEach(dept => {
      csvContent += `"${dept.name}",${dept.count},${dept.avgSalary.toFixed(2)},${dept.totalSalary.toFixed(2)}\n`;
    });
    
    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hr-report-${data.reportType}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Excel report exported successfully");
  };

  if (loading) {
    return (
      <div className="reports-page">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Generating reports...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="reports-page">
        <div className="empty-state">
          <FileText size={48} className="text-gray-400" />
          <h3>No data available</h3>
          <p>Add employees to generate reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="page-header">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={() => navigate("/hr/dashboard")}
          >
            <ChevronLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="header-title">HR Reports</h1>
          <button 
            className="export-btn"
            onClick={exportReport}
          >
            <Download size={20} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      <div className="reports-container">
        {/* Report Type Selector */}
        <div className="report-selector">
          <div className="report-tabs">
            <button
              className={`tab-btn ${selectedReport === "overview" ? "active" : ""}`}
              onClick={() => setSelectedReport("overview")}
            >
              <BarChart3 size={16} />
              <span>Overview</span>
            </button>
            <button
              className={`tab-btn ${selectedReport === "departments" ? "active" : ""}`}
              onClick={() => setSelectedReport("departments")}
            >
              <Building2 size={16} />
              <span>Departments</span>
            </button>
            <button
              className={`tab-btn ${selectedReport === "employees" ? "active" : ""}`}
              onClick={() => setSelectedReport("employees")}
            >
              <Users size={16} />
              <span>Employees</span>
            </button>
          </div>
        </div>

        {/* Overview Report */}
        {selectedReport === "overview" && (
          <div className="report-section">
            <h2 className="section-title">Company Overview</h2>
            <div className="overview-cards">
              <div className="overview-card">
                <div className="card-icon">
                  <Users size={24} />
                </div>
                <div className="card-content">
                  <h3>{stats.totalEmployees}</h3>
                  <p>Total Employees</p>
                </div>
              </div>
              
              <div className="overview-card">
                <div className="card-icon">
                  <Building2 size={24} />
                </div>
                <div className="card-content">
                  <h3>{stats.totalDepartments}</h3>
                  <p>Departments</p>
                </div>
              </div>
              
              <div className="overview-card">
                <div className="card-icon">
                  <DollarSign size={24} />
                </div>
                <div className="card-content">
                  <h3>${stats.avgSalary.toFixed(0)}</h3>
                  <p>Average Salary</p>
                </div>
              </div>
              
              <div className="overview-card">
                <div className="card-icon">
                  <TrendingUp size={24} />
                </div>
                <div className="card-content">
                  <h3>${stats.totalSalary.toFixed(0)}</h3>
                  <p>Total Payroll</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Department Report */}
        {selectedReport === "departments" && (
          <div className="report-section">
            <h2 className="section-title">Department Analysis</h2>
            <div className="department-table">
              <div className="table-header">
                <div>Department</div>
                <div>Employees</div>
                <div>Avg Salary</div>
                <div>Total Salary</div>
              </div>
              {stats.departmentStats.map((dept, index) => (
                <div key={index} className="table-row">
                  <div className="dept-name">{dept.name}</div>
                  <div className="dept-count">{dept.count}</div>
                  <div className="dept-avg">${dept.avgSalary.toFixed(0)}</div>
                  <div className="dept-total">${dept.totalSalary.toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Employee Report */}
        {selectedReport === "employees" && (
          <div className="report-section">
            <h2 className="section-title">Employee Directory</h2>
            <div className="employee-table">
              <div className="table-header">
                <div>Name</div>
                <div>Position</div>
                <div>Department</div>
                <div>Salary</div>
              </div>
              {employees.map((emp, index) => (
                <div key={index} className="table-row">
                  <div className="emp-name">{emp.FullName}</div>
                  <div className="emp-position">{emp.position}</div>
                  <div className="emp-dept">{emp.Department}</div>
                  <div className="emp-salary">${emp.salary}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
