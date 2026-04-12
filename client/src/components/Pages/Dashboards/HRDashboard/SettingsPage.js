import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  User,
  Bell,
  Lock,
  Globe,
  Moon,
  Sun,
  Monitor,
  Smartphone,
  Mail,
  Shield,
  Database,
  Download,
  Save,
  ChevronLeft,
  Eye,
  EyeOff,
  Upload
} from "lucide-react";
import { useAuth } from "../../../../contexts/AuthContext";
import { authAPI } from "../../../../services/apiService";
import "./SettingsPage.css";
import toast from "react-hot-toast";

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, theme, toggleTheme, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [loading, setLoading] = useState(false);
  const [uploadingProfilePic, setUploadingProfilePic] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || "",
    email: user?.email || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [preferences, setPreferences] = useState({
    notifications: {
      email: true,
      push: false,
      desktop: true
    },
    theme: theme || "light",
    language: "en",
    privacy: {
      profileVisibility: "team",
      activityStatus: true
    }
  });

  const tabs = [
    { id: "profile", label: "Profile", icon: <User size={18} /> },
    { id: "security", label: "Security", icon: <Lock size={18} /> },
    { id: "notifications", label: "Notifications", icon: <Bell size={18} /> },
    { id: "preferences", label: "Preferences", icon: <Settings size={18} /> },
    { id: "data", label: "Data & Privacy", icon: <Shield size={18} /> }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePreferenceChange = (category, setting, value) => {
    setPreferences(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [setting]: value
      }
    }));
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();

    if (!formData.username || !formData.email) {
      toast.error("Username and email are required");
      return;
    }

    setLoading(true);
    try {
      await authAPI.updateProfile({
        username: formData.username,
        email: formData.email
      });
      toast.success("Profile updated successfully!");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only image files (JPEG, JPG, PNG, GIF) are allowed");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }

    setUploadingProfilePic(true);
    try {
      // Compress and resize image
      const compressedFile = await compressImage(file);
      await authAPI.uploadProfilePicture(compressedFile);
      toast.success("Profile picture uploaded successfully!");
      // Refresh user data to get updated profile picture
      await refreshUser();
    } catch (error) {
      toast.error("Failed to upload profile picture");
    } finally {
      setUploadingProfilePic(false);
    }
  };

  // Compress and resize image to fit circular container
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Set target size (400x400 for good quality)
          const targetSize = 400;
          canvas.width = targetSize;
          canvas.height = targetSize;
          
          // Calculate dimensions to cover the entire canvas
          const scale = Math.max(targetSize / img.width, targetSize / img.height);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          const offsetX = (targetSize - scaledWidth) / 2;
          const offsetY = (targetSize - scaledHeight) / 2;
          
          // Clear and draw centered image
          ctx.clearRect(0, 0, targetSize, targetSize);
          ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
          
          // Convert to blob with compression
          canvas.toBlob((blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          }, 'image/jpeg', 0.8); // 80% quality
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    console.log('Password change form submitted');
    
    // Early validation
    if (!formData.currentPassword?.trim() || !formData.newPassword?.trim() || !formData.confirmPassword?.trim()) {
      toast.error("All password fields are required");
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (formData.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    // Prevent duplicate submissions
    if (loading) return;
    
    setLoading(true);
    try {
      console.log('Making API call to change password');
      const response = await authAPI.changePassword({
        currentPassword: formData.currentPassword.trim(),
        newPassword: formData.newPassword.trim()
      });
      console.log('Password change response:', response);
      toast.success("Password changed successfully!");
      setFormData(prev => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }));
    } catch (error) {
      console.error('Password change error:', error);
      toast.error(`Failed to change password: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportData = () => {
    // Mock export functionality
    const data = {
      user: {
        username: user?.username,
        email: user?.email,
        role: user?.role
      },
      preferences: preferences,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hr-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Settings exported successfully");
  };

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="header-content">
          <button 
            className="back-button"
            onClick={() => navigate("/HRDashboard")}
          >
            <ChevronLeft size={20} />
            <span>Back to Dashboard</span>
          </button>
          <div className="header-info">
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage your account and preferences</p>
          </div>
        </div>
      </div>

      <div className="settings-container">
        <div className="settings-sidebar">
          <div className="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-content">
          {activeTab === "profile" && (
            <div className="settings-section">
              <h2>Profile Information</h2>
              <form onSubmit={handleProfileUpdate} className="settings-form">
                <div className="profile-picture-section">
                  <label>Profile Picture</label>
                  <div className="profile-picture-upload">
                    <div className="current-profile-picture">
                      {user?.profile_picture ? (
                        <img src={`http://localhost:5000${user.profile_picture}`} alt="Profile" />
                      ) : (
                        <div className="profile-picture-placeholder">
                          <User size={48} />
                        </div>
                      )}
                    </div>
                    <div className="upload-controls">
                      <input
                        type="file"
                        id="profilePicture"
                        accept="image/jpeg,image/jpg,image/png,image/gif"
                        onChange={handleProfilePictureUpload}
                        style={{ display: 'none' }}
                      />
                      <label 
                        htmlFor="profilePicture" 
                        className={`upload-btn ${uploadingProfilePic ? 'uploading' : ''}`}
                      >
                        {uploadingProfilePic ? (
                          <>
                            <div className="spinner"></div>
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={16} />
                            <span>Upload Picture</span>
                          </>
                        )}
                      </label>
                      <p className="upload-info">
                        JPEG, JPG, PNG, GIF (Max 5MB)
                      </p>
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="Enter your username"
                  />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <input
                    type="text"
                    value={user?.role || ""}
                    disabled
                    className="disabled-input"
                  />
                </div>
                <button 
                  type="submit" 
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="spinner"></div>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Profile</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {activeTab === "security" && (
            <div className="settings-section">
              <h2>Security Settings</h2>
              <form onSubmit={handlePasswordChange} className="settings-form">
                <div className="form-group">
                  <label>Current Password</label>
                  <div className="password-input">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      name="currentPassword"
                      value={formData.currentPassword}
                      onChange={handleInputChange}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <div className="password-input">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      name="newPassword"
                      value={formData.newPassword}
                      onChange={handleInputChange}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <div className="password-input">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit" 
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="spinner"></div>
                  ) : (
                    <>
                      <Lock size={16} />
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="settings-section">
              <h2>Notification Preferences</h2>
              <div className="preference-group">
                <div className="preference-item">
                  <div className="preference-info">
                    <Mail size={20} />
                    <div>
                      <h3>Email Notifications</h3>
                      <p>Receive updates and alerts via email</p>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notifications.email}
                      onChange={(e) => handlePreferenceChange('notifications', 'email', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="preference-item">
                  <div className="preference-info">
                    <Smartphone size={20} />
                    <div>
                      <h3>Push Notifications</h3>
                      <p>Receive push notifications on mobile devices</p>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notifications.push}
                      onChange={(e) => handlePreferenceChange('notifications', 'push', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <div className="preference-item">
                  <div className="preference-info">
                    <Monitor size={20} />
                    <div>
                      <h3>Desktop Notifications</h3>
                      <p>Show desktop notifications when browser is open</p>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={preferences.notifications.desktop}
                      onChange={(e) => handlePreferenceChange('notifications', 'desktop', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="settings-section">
              <h2>Appearance & Language</h2>
              <div className="preference-group">
                <div className="preference-item">
                  <div className="preference-info">
                    {preferences.theme === "light" ? <Sun size={20} /> : <Moon size={20} />}
                    <div>
                      <h3>Theme</h3>
                      <p>Choose your preferred color scheme</p>
                    </div>
                  </div>
                  <div className="theme-options">
                    <button
                      className={`theme-btn ${theme === "light" ? "active" : ""}`}
                      onClick={() => toggleTheme()}
                    >
                      <Sun size={16} />
                      <span>Light</span>
                    </button>
                    <button
                      className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                      onClick={() => toggleTheme()}
                    >
                      <Moon size={16} />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>
                <div className="preference-item">
                  <div className="preference-info">
                    <Globe size={20} />
                    <div>
                      <h3>Language</h3>
                      <p>Select your preferred language</p>
                    </div>
                  </div>
                  <select
                    value={preferences.language}
                    onChange={(e) => handlePreferenceChange('language', null, e.target.value)}
                    className="language-select"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="settings-section">
              <h2>Data & Privacy</h2>
              <div className="data-actions">
                <div className="action-card">
                  <div className="action-icon">
                    <Download size={24} />
                  </div>
                  <div className="action-content">
                    <h3>Export Your Data</h3>
                    <p>Download all your personal data and settings</p>
                    <button onClick={exportData} className="action-btn">
                      <Download size={16} />
                      <span>Export Data</span>
                    </button>
                  </div>
                </div>
                <div className="action-card">
                  <div className="action-icon">
                    <Shield size={24} />
                  </div>
                  <div className="action-content">
                    <h3>Privacy Settings</h3>
                    <p>Control how your information is shared</p>
                    <button className="action-btn">
                      <Shield size={16} />
                      <span>Manage Privacy</span>
                    </button>
                  </div>
                </div>
                <div className="action-card">
                  <div className="action-icon">
                    <Database size={24} />
                  </div>
                  <div className="action-content">
                    <h3>Data Storage</h3>
                    <p>View and manage your stored data</p>
                    <button className="action-btn">
                      <Database size={16} />
                      <span>View Storage</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
