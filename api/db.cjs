const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

function getRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value === "undefined") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: getRequiredEnv("DB_USER"),
  password: getRequiredEnv("DB_PASSWORD"),
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "auth",
  charset: process.env.DB_CHARSET || "utf8mb4",
  namedPlaceholders: true,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT || 0),
});

module.exports = pool;
