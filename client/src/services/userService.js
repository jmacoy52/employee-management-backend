import api from './api';
import toast from 'react-hot-toast';

export const userService = {
  // Get all users
  getAll: async () => {
    try {
      const response = await api.get('/users/all');
      return { success: true, data: response.data };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to fetch users';
      toast.error(message);
      return { success: false, error: message };
    }
  },

  // Get user by ID
  getById: async (id) => {
    try {
      const response = await api.get(`/users/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to fetch user';
      toast.error(message);
      return { success: false, error: message };
    }
  },

  // Create user
  create: async (userData) => {
    try {
      const response = await api.post('/users', userData);
      toast.success('User created successfully!');
      return { success: true, data: response.data };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to create user';
      toast.error(message);
      return { success: false, error: message };
    }
  },

  // Update user
  update: async (id, userData) => {
    try {
      const response = await api.put(`/users/${id}`, userData);
      toast.success('User updated successfully!');
      return { success: true, data: response.data };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to update user';
      toast.error(message);
      return { success: false, error: message };
    }
  },

  // Update user role
  updateRole: async (id, role) => {
    try {
      const response = await api.put(`/admin/users/${id}/role`, { role });
      toast.success('User role updated successfully!');
      return { success: true, data: response.data };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to update user role';
      toast.error(message);
      return { success: false, error: message };
    }
  },

  // Delete user
  delete: async (id) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to delete user';
      toast.error(message);
      return { success: false, error: message };
    }
  },

  // Get user stats
  getStats: async () => {
    try {
      const response = await api.get('/users/stats');
      return { success: true, data: response.data };
    } catch (error) {
      const message = error.response?.data?.error || 'Failed to fetch user stats';
      toast.error(message);
      return { success: false, error: message };
    }
  }
};

export default userService;
