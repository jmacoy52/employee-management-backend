import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';

import Home from './components/Pages/Home';
import Login from './components/Pages/Auth/Login';
import SystemSetup from './components/Pages/SystemSetup';
import Privacy from './components/Pages/Privacy';
import Terms from './components/Pages/Terms';
import Contact from './components/Pages/Contact';
import ForgotPassword from './components/Pages/Auth/ForgotPassword';

import ModernAdminLayout from './components/Pages/Shared/ModernAdminLayout';
import DashboardOverview from './components/Pages/Shared/DashboardOverview';
import UserManagement from './components/Pages/Dashboards/AdminDashboard/UserManagement';
import AuditLog from './components/Pages/Dashboards/AdminDashboard/AuditLog';
import SystemReports from './components/Pages/Dashboards/AdminDashboard/SystemReports';
import SystemSettings from './components/Pages/Dashboards/AdminDashboard/SystemSettings';

import HRLayout from './components/common/layout/HRLayout';
import HRDashboard from './components/Pages/Dashboards/HRDashboard/HRDashboard';
import AddEmployeePage from './components/Pages/Dashboards/HRDashboard/AddEmployeePage';
import EmployeeListPage from './components/Pages/Dashboards/HRDashboard/EmployeeListPage';
import DepartmentsPage from './components/Pages/Dashboards/HRDashboard/DepartmentsPage';
import ReportsPage from './components/Pages/Dashboards/HRDashboard/ReportsPage';
import MyProfilePage from './components/Pages/Dashboards/HRDashboard/MyProfilePage';
import NotificationsPage from './components/Pages/Dashboards/HRDashboard/NotificationsPage';
import SettingsPage from './components/Pages/Dashboards/HRDashboard/SettingsPage';

import './styles/globals.css';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Toaster position="top-right" reverseOrder={false} />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<SystemSetup />} />
            <Route path="/account-creation" element={<Navigate to="/setup" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/contact" element={<Contact />} />

            <Route path="/AdminDashboard" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/HRDashboard" element={<Navigate to="/hr/dashboard" replace />} />

            <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin']} />}>
              <Route
                path="/admin/dashboard"
                element={
                  <ModernAdminLayout title="Dashboard" subtitle="System Overview">
                    <DashboardOverview />
                  </ModernAdminLayout>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ModernAdminLayout title="User Management" subtitle="Create and manage user accounts">
                    <UserManagement />
                  </ModernAdminLayout>
                }
              />
              <Route
                path="/admin/auditlog"
                element={
                  <ModernAdminLayout title="Audit Log" subtitle="System activity and changes">
                    <AuditLog />
                  </ModernAdminLayout>
                }
              />
              <Route
                path="/admin/notifications"
                element={
                  <ModernAdminLayout title="Notifications" subtitle="Tenant alerts and system events">
                    <NotificationsPage />
                  </ModernAdminLayout>
                }
              />
              <Route
                path="/admin/system"
                element={
                  <ModernAdminLayout title="System Settings" subtitle="Configure system parameters">
                    <SystemSettings />
                  </ModernAdminLayout>
                }
              />
              <Route
                path="/admin/reports"
                element={
                  <ModernAdminLayout title="System Reports" subtitle="Generate and view reports">
                    <SystemReports />
                  </ModernAdminLayout>
                }
              />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'hr']} />}>
              <Route
                path="/hr/dashboard"
                element={
                  <HRLayout>
                    <HRDashboard />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/employees"
                element={
                  <HRLayout>
                    <EmployeeListPage />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/create-employee"
                element={
                  <HRLayout>
                    <AddEmployeePage />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/departments"
                element={
                  <HRLayout>
                    <DepartmentsPage />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/reports"
                element={
                  <HRLayout>
                    <ReportsPage />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/profile"
                element={
                  <HRLayout>
                    <MyProfilePage />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/notifications"
                element={
                  <HRLayout>
                    <NotificationsPage />
                  </HRLayout>
                }
              />
              <Route
                path="/hr/settings"
                element={
                  <HRLayout>
                    <SettingsPage />
                  </HRLayout>
                }
              />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'hr', 'employee']} />}>
              <Route
                path="/employee/dashboard"
                element={
                  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="text-center">
                      <h1 className="text-2xl font-bold text-gray-900 mb-4">Employee Dashboard</h1>
                      <p className="text-gray-600">Coming soon...</p>
                    </div>
                  </div>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
