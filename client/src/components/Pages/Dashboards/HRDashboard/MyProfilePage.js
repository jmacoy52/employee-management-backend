import React, { useEffect, useState } from "react";
import axios from "axios";
import HRNav from "../../Shared/HRNav";
import toast from "react-hot-toast";
import "./MyProfilePage.css";

const MyProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
  });
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/users/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setProfile(res.data);
        setFormData({
          first_name: res.data.first_name || "",
          last_name: res.data.last_name || "",
          phone: res.data.phone || "",
          address: res.data.address || "",
        });
      } catch (err) {
        console.error("Error fetching profile:", err);
        toast.error("Failed to load profile.");
      }
    };
    fetchProfile();
  }, [token]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = async () => {
    try {
      await axios.put("http://localhost:5000/api/users/profile", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Profile updated successfully!");
      setProfile({ ...profile, ...formData });
      setIsEditing(false);
    } catch (err) {
      console.error("Error updating profile:", err);
      toast.error("Failed to update profile.");
    }
  };

  const handleCancel = () => {
    setFormData({
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      phone: profile.phone || "",
      address: profile.address || "",
    });
    setIsEditing(false);
  };

  return (
    <div className="my-profile-page">
      <HRNav />
      <h2>My Profile</h2>
      {profile ? (
        <div className="profile-details">
          <p><strong>Username:</strong> {profile.username}</p>
          <p><strong>Email:</strong> {profile.email}</p>
          <p><strong>Role:</strong> {profile.role}</p>
          <p><strong>Full Name:</strong> {profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : "Not set"}</p>
          <p><strong>Phone:</strong> {profile.phone || "Not set"}</p>
          <p><strong>Address:</strong> {profile.address || "Not set"}</p>
          {!isEditing && (
            <button onClick={() => setIsEditing(true)}>Edit Profile</button>
          )}
          {isEditing && (
            <div className="edit-form">
              <label>
                First Name:
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                />
              </label>
              <label>
                Last Name:
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                />
              </label>
              <label>
                Phone:
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                />
              </label>
              <label>
                Address:
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                />
              </label>
              <button onClick={handleSave}>Save</button>
              <button onClick={handleCancel}>Cancel</button>
            </div>
          )}
        </div>
      ) : (
        <p>Loading profile...</p>
      )}
    </div>
  );
};

export default MyProfilePage;
