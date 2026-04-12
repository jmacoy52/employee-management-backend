const db = require('../config/db');

class UserProfileModel {
  static getProfileByUserId(userId, callback) {
    const query = `
      SELECT up.* 
      FROM user_profiles up 
      WHERE up.user_id = ?
    `;
    db.query(query, [userId], (err, results) => {
      callback(err, results[0] || null);
    });
  }

  static upsertProfile(userId, profileData, callback) {
    const fields = ['first_name', 'last_name', 'phone', 'address'].map(field => profileData[field] || null);
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
    db.query(query, [userId, ...fields], callback);
  }
}

module.exports = UserProfileModel;
