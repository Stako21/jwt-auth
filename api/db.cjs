const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "Fl1p2ua.fm",
  port: "3306",
  database: "auth",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

// export default pool;
module.exports = pool;
