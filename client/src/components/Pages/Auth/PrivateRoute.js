import React from "react";
import { Navigate, Outlet } from "react-router-dom";

const PrivateRoute = ({ allowedRoles }) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  if (!token || !user) return <Navigate to="/login" />;

  // Admin can access all routes
  if (user?.role === "admin") {
    return <Outlet />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/login" />;
  }

  return <Outlet />;
};

export default PrivateRoute;
// This component checks if the user is authenticated and has the required role to access certain routes.
// If not, it redirects them to the login page or an unauthorized page.