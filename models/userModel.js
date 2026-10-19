const db = require('../config/db');

class UserModel {
  static registerUser(userData, callback) {
    const query = 'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)';
    const values = [userData.username, userData.email, userData.password, userData.role || 'employee'];
    db.query(query, values, callback);
  }

   //Update User Role
  static updateUserRole(id, userData, callback) {
    // token_version is bumped so the user's old tokens (with the old role) stop working
    const query = 'UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?';
    const values = [userData.role, id];
    db.query(query, values, callback);
  };

  // Set or clear the active flag. Deactivating also revokes existing sessions.
  static setActive(id, isActive, callback) {
    const query = isActive
      ? 'UPDATE users SET is_active = 1 WHERE id = ?'
      : 'UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ?';
    db.query(query, [id], callback);
  }

  // Invalidate every token issued to this user (logout, role change).
  static bumpTokenVersion(id, callback) {
    db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id], callback);
  }

  // Store a new password hash, revoke existing sessions and set/clear the forced-change flag.
  static setPassword(id, hashedPassword, mustChange, callback) {
    const query = `UPDATE users
      SET password = ?, must_change_password = ?, token_version = token_version + 1, password_changed_at = CURRENT_TIMESTAMP
      WHERE id = ?`;
    db.query(query, [hashedPassword, mustChange ? 1 : 0, id], callback);
  }

  static findUserById(id) {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  }

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
}

module.exports = UserModel;
