const mysql = require("mysql");

const pool = mysql.createConnection({
  host: "192.168.1.200",
  user: "sqluser",
  password: "Teflon08",
  database: "auth",
})

// export default pool;
module.exports = pool;
