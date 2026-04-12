import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-hot-toast"; //toast for notifications
import { authAPI } from "../../../services/apiService";
import "./Register.css";

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    role: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate role
    const validRoles = ['admin', 'hr', 'employee'];
    if (!validRoles.includes(formData.role.toLowerCase())) {
      setError("Role must be one of: admin, hr, or employee");
      return;
    }

    try {
      const response = await authAPI.register(formData);

      if (response.status === 201) {
        toast.success("Registration successful!");
        navigate("/login"); // redirect to login
      }
    } catch (err) {
      let errorMessage = "Registration failed. Please try again.";
      
      if (err.response?.data) {
        if (err.response.data.errors?.[0]?.msg) {
          errorMessage = err.response.data.errors[0].msg;
        } else if (err.response.data.error) {
          errorMessage = err.response.data.error;
        }
      } else if (err.response?.status === 429) {
        errorMessage = "Too many registration attempts. Please wait a moment and try again.";
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = "Cannot connect to server. Please check if backend is running.";
      } else if (err.code === 'NETWORK_ERROR') {
        errorMessage = "Network error. Please check your connection.";
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  return (
    <div className="auth-container">
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          placeholder="Username"
          value={formData.username}
          onChange={handleChange}
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />
        <select
          name="role"
          value={formData.role}
          onChange={handleChange}
          required
        >
          <option value="">Select Role</option>
          <option value="employee">Employee</option>
          <option value="hr">HR</option>
          <option value="admin">Admin</option>
        </select>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-register">Register</button>
      </form>
      <div className="auth-links">
        <Link to="/login">Already have an account? Login</Link>
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
};

export default Register;
