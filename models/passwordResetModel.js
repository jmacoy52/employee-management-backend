const crypto = require('crypto');
const db = require('../config/db');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

class PasswordResetModel {
  // Creates a one-time token for userId and returns the plain token (only the hash is stored).
  // Any earlier unused tokens for the same user are invalidated.
  static create(userId, createdBy, ttlMinutes, callback) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    db.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId], (err) => {
      if (err) return callback(err);
      db.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_by) VALUES (?, ?, ?, ?)',
        [userId, hashToken(token), expiresAt, createdBy],
        (insErr) => (insErr ? callback(insErr) : callback(null, { token, expiresAt }))
      );
    });
  }

  // Finds a usable (unused, unexpired) token row with its user's active flag.
  static findValid(token, callback) {
    db.query(
      `SELECT t.id, t.user_id, u.is_active
       FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > UTC_TIMESTAMP()`,
      [hashToken(token)],
      (err, rows) => (err ? callback(err) : callback(null, rows[0] || null))
    );
  }

  // Marks the token used; affectedRows = 0 means someone else used it first.
  static markUsed(id, callback) {
    db.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL', [id], callback);
  }
}

module.exports = PasswordResetModel;
