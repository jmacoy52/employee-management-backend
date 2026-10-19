require('dotenv').config();

const mysql = require('mysql2');
const { buildDbConfig } = require('./dbConfig');

// A pool instead of a single connection: dropped connections are replaced
// automatically, so a database restart or idle timeout no longer kills the API.
const db = mysql.createPool(
  buildDbConfig({
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  })
);

db.on('connection', () => console.log('MySQL: new pooled connection established'));

// Check connectivity at startup, but never exit: the server keeps running and
// /api/health reports the database state until MySQL becomes reachable.
function checkConnection(attempt = 1) {
  db.query('SELECT 1', (err) => {
    if (err) {
      const delay = Math.min(30000, 2000 * attempt);
      console.error(`MySQL connection failed (attempt ${attempt}): ${err.message}. Retrying in ${delay / 1000}s`);
      setTimeout(() => checkConnection(attempt + 1), delay).unref();
    } else {
      console.log('MySQL connected successfully!');
    }
  });
}
checkConnection();

module.exports = db;
