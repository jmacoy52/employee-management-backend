const db = require('../config/db');

// Which accounts a query may touch:
//   a number   = one organisation (req.user.organizationId of an org admin/HR)
//   ANY_ORG    = any organisation's account (platform owner console). Never matches an owner.
const ANY_ORG = Symbol('any organisation');

// SQL condition + params for a scope. Throws if no scope is given, so a missing tenant filter
// fails loudly instead of reaching every organisation.
function scopeClause(scope, column = 'organization_id') {
  if (scope === ANY_ORG) return { sql: `${column} IS NOT NULL`, params: [] };
  if (Number.isInteger(scope) && scope > 0) return { sql: `${column} = ?`, params: [scope] };
  throw new Error('Organisation scope is required');
}

class UserModel {
   //Update User Role (within the scope; affectedRows = 0 when the user is not in it)
  static updateUserRole(id, scope, userData, callback) {
    const where = scopeClause(scope);
    // token_version is bumped so the user's old tokens (with the old role) stop working
    const query = `UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ? AND ${where.sql}`;
    const values = [userData.role, id, ...where.params];
    db.query(query, values, callback);
  };

  // Set or clear the active flag. Deactivating also revokes existing sessions.
  static setActive(id, scope, isActive, callback) {
    const where = scopeClause(scope);
    const query = isActive
      ? `UPDATE users SET is_active = 1 WHERE id = ? AND ${where.sql}`
      : `UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ? AND ${where.sql}`;
    db.query(query, [id, ...where.params], callback);
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

  // Own account (any role, including the owner)
  static findUserById(id) {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  }

  // Someone else's account, only if it is inside the scope (null otherwise, so callers answer 404)
  static findUserInScope(id, scope) {
    const where = scopeClause(scope);
    return new Promise((resolve, reject) => {
      db.query(`SELECT * FROM users WHERE id = ? AND ${where.sql}`, [id, ...where.params], (err, results) => {
        if (err) return reject(err);
        resolve(results[0] || null);
      });
    });
  }

   //Delete user (within the scope)
   static deleteUser(id, scope, callback){
    const where = scopeClause(scope);
    const query = `DELETE FROM users WHERE id=? AND ${where.sql}`;
    db.query(query, [id, ...where.params], callback);
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
module.exports.ANY_ORG = ANY_ORG;
module.exports.scopeClause = scopeClause;
