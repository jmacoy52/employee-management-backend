import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import EmployeeForm from "../../Shared/EmployeeForm";
import { ArrowLeft, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import "./AddEmployeePage.css";

const AddEmployeePage = () => {
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(true);

  const handleEmployeeCreated = () => {
    toast.success("Employee added successfully!");
    navigate("/hr/employees");
  };

  const handleCancel = () => {
    navigate("/hr/dashboard");
  };

  return (
    <div className="add-employee-page">
      <div className="page-header">
        <div className="header-content">
          <button
            className="back-button"
            onClick={() => navigate("/HRDashboard")}
          >
            <ArrowLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="header-title">Add New Employee</h1>
        </div>
      </div>

      <div className="add-employee-container">
        <div className="page-content">
          {showCreateForm && (
            <EmployeeForm
              onSuccess={handleEmployeeCreated}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AddEmployeePage;
