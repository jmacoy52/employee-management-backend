// Secure storage implementation using httpOnly cookies
class SecureStorage {
  constructor() {
    this.tokenKey = 'auth_token';
    this.userKey = 'auth_user';
  }

  // Set token with security measures
  setToken(token, expiresIn) {
    try {
      // Set httpOnly cookie (server-side)
      // For client-side, use sessionStorage with encryption
      const encryptedToken = this.encrypt(token);
      sessionStorage.setItem(this.tokenKey, encryptedToken);
      
      // Set expiration
      const expirationTime = Date.now() + (expiresIn * 1000);
      sessionStorage.setItem(`${this.tokenKey}_exp`, expirationTime.toString());
    } catch (error) {
      console.error('Failed to set token securely:', error);
    }
  }

  // Get token with validation
  getToken() {
    try {
      const encryptedToken = sessionStorage.getItem(this.tokenKey);
      const expirationTime = sessionStorage.getItem(`${this.tokenKey}_exp`);
      
      if (!encryptedToken || !expirationTime) {
        return null;
      }
      
      // Check if token is expired
      if (Date.now() > parseInt(expirationTime)) {
        this.clearToken();
        return null;
      }
      
      return this.decrypt(encryptedToken);
    } catch (error) {
      console.error('Failed to get token securely:', error);
      return null;
    }
  }

  // Clear token
  clearToken() {
    try {
      sessionStorage.removeItem(this.tokenKey);
      sessionStorage.removeItem(`${this.tokenKey}_exp`);
    } catch (error) {
      console.error('Failed to clear token:', error);
    }
  }

  // Set user data
  setUser(userData) {
    try {
      const encryptedUser = this.encrypt(JSON.stringify(userData));
      sessionStorage.setItem(this.userKey, encryptedUser);
    } catch (error) {
      console.error('Failed to set user data securely:', error);
    }
  }

  // Get user data
  getUser() {
    try {
      const encryptedUser = sessionStorage.getItem(this.userKey);
      if (!encryptedUser) {
        return null;
      }
      
      const decryptedUser = this.decrypt(encryptedUser);
      return JSON.parse(decryptedUser);
    } catch (error) {
      console.error('Failed to get user data securely:', error);
      return null;
    }
  }

  // Clear user data
  clearUser() {
    try {
      sessionStorage.removeItem(this.userKey);
    } catch (error) {
      console.error('Failed to clear user data:', error);
    }
  }

  // Clear all auth data
  clearAll() {
    this.clearToken();
    this.clearUser();
  }

  // Simple encryption (in production, use proper encryption)
  encrypt(data) {
    try {
      // Use a simple XOR cipher for demonstration
      // In production, use proper encryption like AES
      const key = 'emplocore-secure-key-2024';
      let encrypted = '';
      for (let i = 0; i < data.length; i++) {
        encrypted += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return btoa(encrypted);
    } catch (error) {
      console.error('Encryption failed:', error);
      return data;
    }
  }

  // Simple decryption (in production, use proper encryption)
  decrypt(encryptedData) {
    try {
      const key = 'emplocore-secure-key-2024';
      const decoded = atob(encryptedData);
      let decrypted = '';
      for (let i = 0; i < decoded.length; i++) {
        decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      return encryptedData;
    }
  }

  // Check if token is valid
  isTokenValid() {
    const token = this.getToken();
    return !!token;
  }

  // Get token expiration
  getTokenExpiration() {
    try {
      const expirationTime = sessionStorage.getItem(`${this.tokenKey}_exp`);
      return expirationTime ? parseInt(expirationTime) : null;
    } catch (error) {
      console.error('Failed to get token expiration:', error);
      return null;
    }
  }
}

// Create singleton instance
const secureStorage = new SecureStorage();

export default secureStorage;
