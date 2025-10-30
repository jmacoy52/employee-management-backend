const db = require('../config/db');

class UserProfileModel {
  // Get user profile by user ID
  static getProfileByUserId(userId, callback) {
    const query = 'SELECT * FROM user_profiles WHERE user_id = ?';
    db.query(query, [userId], (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]);
    });
  }

  // Insert or update user profile
  static upsertProfile(userId, profileData, callback) {
    const query = `
      INSERT INTO user_profiles (user_id, first_name, last_name, phone, address)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      phone = VALUES(phone),
      address = VALUES(address),
      updated_at = CURRENT_TIMESTAMP
    `;
    const values = [
      userId,
      profileData.first_name || null,
      profileData.last_name || null,
      profileData.phone || null,
      profileData.address || null
    ];
    db.query(query, values, callback);
  }
}

module.exports = UserProfileModel;
