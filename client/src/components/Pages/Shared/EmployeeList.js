import React from "react";
import { useState } from 'react'; 
import { Pencil, Trash2 } from "lucide-react";
import "./EmployeeForm.css";

/**
 * EmployeeList Component - Reusable employee list component
 * Used by HR Dashboard for displaying employee data
 */
const EmployeeList = ({ employees, onEdit, onDelete }) => {
    const [selectedDept, setSelectedDept] = useState("All");

    // Ensure employees is an array
    const employeeList = Array.isArray(employees) ? employees : [];

    const departments = [
        "All",
        ...Array.from(new Set(employeeList.map((emp) => emp.Department))),
    ];

    const filteredEmployees =
        selectedDept === "All"
            ? employeeList
            : employeeList.filter((emp) => emp.Department === selectedDept);

    return (
        <div className="employee-list-container">
            {/* Department Filter */}
            <div className="department-filter">
                <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="department-select"
                >
                    {departments.map((dept) => (
                        <option key={dept} value={dept}>
                            {dept}
                        </option>
                    ))}
                </select>
            </div>

            {/* Employee Grid */}
            <div className="employee-grid">
                {filteredEmployees.map((employee) => (
                    <div key={employee.id} className="employee-card">
                        <div className="employee-info">
                            <h3>{employee.FullName}</h3>
                            <p>{employee.position}</p>
                            <p className="department">{employee.Department}</p>
                            <p className="salary">₵{employee.salary}</p>
                        </div>
                        <div className="employee-actions">
                            <button
                                onClick={() => onEdit(employee)}
                                className="action-btn edit-btn"
                                title="Edit employee"
                            >
                                <Pencil size={16} />
                            </button>
                            <button
                                onClick={() => onDelete(employee.id)}
                                className="action-btn delete-btn"
                                title="Delete employee"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State */}
            {filteredEmployees.length === 0 && (
                <div className="empty-state">
                    <p>No employees found</p>
                </div>
            )}
        </div>
    );
};

export default EmployeeList;
