require('dotenv').config({ path: __dirname + '/../.env' });

const mysql = require('mysql2');
const dotenv= require('dotenv');
dotenv.config(); // Load environment variables



const db = mysql.createConnection({
  
  database: process.env.DB_URL,
  port: process.env.DB_PORT || 3306,
});


//Test the connection and log results
db.connect((err) => {
  if (err) {
    console.error('MySQL connection failed:', err.message);
    process.exit(1); // Stop the server if connection fails
  } else {
    console.log('MySQL connected successfully!');
  }
});

module.exports = db; // EXPORT the connection so it can be used elsewhere