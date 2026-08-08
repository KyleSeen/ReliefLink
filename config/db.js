// config/db.js — MySQL connection pool (mysql2)
// Reads all connection settings from environment variables (see .env.example).
// For AWS, only DB_HOST / DB_USER / DB_PASSWORD change to point at RDS — no code changes.

require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'relieflink',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Export a promise-based pool so routes can use async/await.
module.exports = pool.promise();
