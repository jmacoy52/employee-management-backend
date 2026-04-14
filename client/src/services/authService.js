import api from './api';
import toast from 'react-hot-toast';
import secureStorage from './secureStorage';

export const authService = {
  // Login user
  login: async (credentials) => {
    try {
      const response = await api.post('/api/users/login', credentials);
      const { token, user } = response.data;
      
      // Store securely
      secureStorage.setToken(token, 24 * 60 * 60); // 24 hours
      secureStorage.setUser(user);
      
      toast.success('Login successful!');
      return { success: true, data: { token, user } };
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    }
  },
  // Logout user
  logout: () => {
    secureStorage.clearAll();
    toast.success('Logged out successfully');
  },

  // Get current user
  getCurrentUser: () => {
    return secureStorage.getUser();
  },

  // Get auth token
  getToken: () => {
    return secureStorage.getToken();
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return secureStorage.isTokenValid();
  }
};

export default authService;
