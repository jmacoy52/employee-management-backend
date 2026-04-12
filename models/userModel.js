const db = require('../config/db');

class UserModel {
  static registerUser(userData, callback) {
    const query = 'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)';
    const values = [userData.username, userData.email, userData.password, userData.role || 'user'];
    db.query(query, values, callback);
  }

   //Update User Role
  static updateUserRole(id, userData, callback) {
    const query = 'UPDATE users SET role = ? WHERE id = ?';
    const values = [userData.role, id];
    db.query(query, values, callback);
  };

   //Delete user
   static deleteUser(id, callback){
    const query = 'DELETE FROM users WHERE id=?';
    db.query(query, [id], callback);
   }
 // Inside the UserModel class
static findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM users WHERE email = ?';

    // Execute the SQL query to check if the email exists
    db.query(query, [email], (err, results) => {
      if (err) {     
        return reject(err);  // If there's a DB error, reject the Promise
      }
      if (results.length > 0) {  
        return resolve(results[0]);  // If a user with that email is found, resolve with the user object
      }
      return resolve(null);   // If no user is found, resolve with null
    });
  });
  
}

  // Find user by ID
  static findUserById(id, callback) {
    const query = 'SELECT * FROM users WHERE id = ?';
    db.query(query, [id], callback);
  }

  // Find user by ID (Promise version)
  static findUserByIdAsync(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE id = ?';
      db.query(query, [id], (err, results) => {
        if (err) {
          return reject(err);
        }
        if (results.length === 0) {
          return resolve(null);
        }
        resolve(results[0]);
      });
    });
  }

  // Get user profile by ID
  static getProfile(id, callback) {
    const query = `
      SELECT id, username, email, role, profile_picture, created_at 
      FROM users 
      WHERE id = ?
    `;
    db.query(query, [id], callback);
  }

  // Update user profile
  static updateUserProfile(id, userData, callback) {
    const fields = [];
    const values = [];
    
    Object.keys(userData).forEach(key => {
      fields.push(`${key} = ?`);
      values.push(userData[key]);
    });
    
    values.push(id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    db.query(query, values, callback);
  }

  // Update failed login attempts and lock status
  static updateFailedAttempts(id, attempts, locked, callback) {
    const query = 'UPDATE users SET failed_login_attempts = ?, account_locked = ? WHERE id = ?';
    db.query(query, [attempts, locked, id], callback);
  }

  // Get all users with pagination
  static getAllUsersPaginated(limit, offset, callback) {
    const query = 'SELECT id, username, email, role, created_at FROM users ORDER BY id DESC LIMIT ? OFFSET ?';
    db.query(query, [limit, offset], callback);
  }

  // Get total count of users
  static getTotalUserCount(callback) {
    const query = 'SELECT COUNT(*) as total FROM users';
    db.query(query, (err, results) => {
      if (err) return callback(err);
      callback(null, results[0].total);
    });
  }

  // Create new user (Admin)
  static createUser(userData, callback) {
    const query = `
      INSERT INTO users (
        email, password, role, firstName, lastName, department, position, 
        isTemporaryPassword, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      userData.email,
      userData.password,
      userData.role,
      userData.firstName,
      userData.lastName,
      userData.department,
      userData.position,
      userData.isTemporaryPassword || false,
      userData.created_at,
      userData.updated_at
    ];
    db.query(query, values, callback);
  }
}

module.exports = UserModel;
