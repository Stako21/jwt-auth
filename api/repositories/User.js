import pool from "../db.cjs";

class UserRepository {
  static async createUser({ userName, hashedPassword, role, city }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      console.log('++++++++++++++++++++++++++++++');
      console.log(userName, role, city);
      console.log('++++++++++++++++++++++++++++++');

      const [insertResult] = await connection.query(
        "INSERT INTO users (name, password, role, city) VALUES (?, ?, ?, ?)",
        [userName, hashedPassword, role, city]
      );

      const userId = insertResult.insertId;
      const [rows] = await connection.query(
        "SELECT * FROM users WHERE id = ?",
        [userId]
      );

      await connection.commit();

      return rows[0];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }


  static async getUserData(userName) {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE name = ?", [userName]);
    console.log("!!!!!!![rows]!!!!!!!");
    console.log([rows]);
    console.log("!!!!!!![rows]!!!!!!!");
    console.log("!!!!!!!rows!!!!!!!");
    console.log(rows);
    console.log("!!!!!!!rows!!!!!!!");
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.log('@@@@@@@@@@@@@@@@@@@@getUserData@@@@@@@@@@@@@@@');
    console.log(error);
    console.log('@@@@@@@@@@@@@@@@@@@@getUserData@@@@@@@@@@@@@@@');

    throw error;
  }
}

  static async getAllUsers() {
  // const query = 'SELECT id, name, role FROM users';
  const [rows] = await pool.query("SELECT id, name, role, city FROM users");
  // const [rows] = await db.execute(query);
  console.log("@@@!!!!!!![rows]!!!!!!!@@@");
  console.log([rows]);
  console.log("@@@!!!!!!![rows]!!!!!!!@@@");
  console.log("###!!!!!!!rows!!!!!!!###");
  console.log(rows);
  console.log("###!!!!!!!rows!!!!!!!###");

  return rows;
}
}

export default UserRepository;
