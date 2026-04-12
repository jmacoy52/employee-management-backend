import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';

// Import pages
import Home from './components/Pages/Home';
import Login from './components/Pages/Auth/Login';
import Register from './components/Pages/Auth/Register';
import SystemSetup from './components/Pages/SystemSetup';
import Privacy from './components/Pages/Privacy';
import Terms from './components/Pages/Terms';
import Contact from './components/Pages/Contact';

// Admin pages
import AdminLayout from './components/common/layout/AdminLayout';
import AdminDashboard from './components/Pages/admin/Dashboard.js';
import UserManagement from './components/Pages/Dashboards/AdminDashboard/UserManagement.js';

// HR pages
import HRLayout from './components/common/layout/HRLayout';
import HRDashboard from './components/Pages/Dashboards/HRDashboard/HRDashboard';

// Import styles
import './styles/globals.css';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Toaster position="top-right" reverseOrder={false} />
          <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/setup" element={<SystemSetup />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/contact" element={<Contact />} />

          {/* Admin Routes - Protected */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/AdminDashboard" element={
              <AdminLayout>
                <AdminDashboard />
              </AdminLayout>
            } />
            <Route path="/admin/users" element={
              <AdminLayout>
                <UserManagement />
              </AdminLayout>
            } />
            <Route path="/admin/auditlog" element={
              <AdminLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Audit Logs</h1>
                  <p className="text-gray-600">Audit logs coming soon...</p>
                </div>
              </AdminLayout>
            } />
            <Route path="/admin/system" element={
              <AdminLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">System Settings</h1>
                  <p className="text-gray-600">System settings coming soon...</p>
                </div>
              </AdminLayout>
            } />
            <Route path="/admin/reports" element={
              <AdminLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">System Reports</h1>
                  <p className="text-gray-600">System reports coming soon...</p>
                </div>
              </AdminLayout>
            } />
          </Route>

          {/* HR Routes - Protected */}
          <Route element={<ProtectedRoute allowedRoles={['hr', 'admin']} />}>
            <Route path="/hr/dashboard" element={
              <HRLayout>
                <HRDashboard />
              </HRLayout>
            } />
            <Route path="/hr/employees" element={
              <HRLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Employees</h1>
                  <p className="text-gray-600">Employee management coming soon...</p>
                </div>
              </HRLayout>
            } />
            <Route path="/hr/departments" element={
              <HRLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Departments</h1>
                  <p className="text-gray-600">Department management coming soon...</p>
                </div>
              </HRLayout>
            } />
            <Route path="/hr/reports" element={
              <HRLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Reports</h1>
                  <p className="text-gray-600">HR reports coming soon...</p>
                </div>
              </HRLayout>
            } />
            <Route path="/hr/profile" element={
              <HRLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">My Profile</h1>
                  <p className="text-gray-600">Profile management coming soon...</p>
                </div>
              </HRLayout>
            } />
            <Route path="/hr/notifications" element={
              <HRLayout>
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Notifications</h1>
                  <p className="text-gray-600">Notifications coming soon...</p>
                </div>
              </HRLayout>
            } />
          </Route>

          {/* Employee Routes - Protected */}
          <Route element={<ProtectedRoute allowedRoles={['employee', 'hr', 'admin']} />}>
            <Route path="/employee/dashboard" element={
              <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-gray-900 mb-4">Employee Dashboard</h1>
                  <p className="text-gray-600">Coming soon...</p>
                </div>
              </div>
            } />
          </Route>
        </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
