import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-hot-toast"; // toast for notifications
import { authService } from "../../../services/authService";
import { useAuth } from "../../../contexts/AuthContext";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  // handle field change
  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  // handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const result = await login(formData);

      if (result.success) {
        // redirect based on role
        const user = result.data.user;
        console.log('Login response user data:', user); // Debug log
        
        toast.success("Login successful!");
        
        if (user.role === "admin") {
          navigate("/AdminDashboard");
        } else if (user.role === "hr") {
          navigate("/hr/dashboard");
        } else {
          navigate("/employee/dashboard");
        }
      } else {
        setError(result.error || "Login failed. Please try again.");
        toast.error(result.error || "Login failed. Please try again.");
      }
    } catch (err) {
      const errorResponse = err.response?.data;
      let errorMessage = "Login failed. Please try again.";
      
      if (errorResponse) {
        if (errorResponse.reason === 'account_locked') {
          errorMessage = errorResponse.error;
        } else if (errorResponse.reason === 'invalid_credentials') {
          errorMessage = errorResponse.error;
        } else if (errorResponse.errors?.[0]?.msg) {
          errorMessage = errorResponse.errors[0].msg;
        } else if (errorResponse.error) {
          errorMessage = errorResponse.error;
        }
      } else if (err.response?.status === 429) {
        errorMessage = "Too many login attempts. Please wait a moment and try again.";
      } else if (err.code === 'ECONNREFUSED') {
        errorMessage = "Cannot connect to server. Please check if the backend is running.";
      } else if (err.code === 'NETWORK_ERROR') {
        errorMessage = "Network error. Please check your connection.";
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  //  UI
  return (
    <div className="auth-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
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
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-login">
          Login
        </button>
      </form>
      <div className="auth-links">
        <Link to="/register">Don't have an account? Register</Link>
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
};

export default Login;
