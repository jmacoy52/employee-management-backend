import axios from 'axios';
import API_BASE_URL from '../config/api';

// Create axios instance with default configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API methods
export const authAPI = {
  login: (credentials) => api.post('/api/users/login', credentials),
  register: (userData) => api.post('/api/users/register', userData),
  forgotPassword: (email) => api.post('/api/users/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post('/api/users/reset-password', { token, newPassword }),
  changePassword: (passwords) => api.put('/api/users/change-password', passwords),
  getProfile: () => api.get('/api/users/profile'),
  updateProfile: (profileData) => api.put('/api/users/profile', profileData),
  uploadProfilePicture: (file) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return api.post('/api/users/profile-picture', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

export const hrAPI = {
  getEmployees: () => api.get('/api/employees'),
  addEmployee: (employeeData) => api.post('/api/employees', employeeData),
  updateEmployee: (id, employeeData) => api.put(`/api/employees/${id}`, employeeData),
  deleteEmployee: (id) => api.delete(`/api/employees/${id}`),
  getDashboardStats: () => api.get('/api/hr/dashboard'),
};

export const adminAPI = {
  getUsers: () => api.get('/api/admin/users'),
  createUser: (userData) => api.post('/api/admin/users', userData),
  updateUser: (id, userData) => api.put(`/api/admin/users/${id}`, userData),
  deleteUser: (id) => api.delete(`/api/admin/users/${id}`),
  getAuditLogs: () => api.get('/api/admin/audit-logs'),
};

export const notificationAPI = {
  getNotifications: () => api.get('/api/notifications'),
  getUnreadCount: () => api.get('/api/notifications/unread-count'),
  markAsRead: (id) => api.put(`/api/notifications/${id}/read`),
  markAllAsRead: () => api.put('/api/notifications/mark-all-read'),
  deleteNotification: (id) => api.delete(`/api/notifications/${id}`),
  clearAllNotifications: () => api.delete('/api/notifications'),
  createSystemNotification: (data) => api.post('/api/notifications/system', data),
};

export default api;
