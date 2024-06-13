import pool from "../db.cjs";

class UserRepository {
  static async createUser({ userName, hashedPassword, role }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [insertResult] = await connection.query(
        "INSERT INTO users (name, password, role) VALUES (?, ?, ?)",
        [userName, hashedPassword, role]
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
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.log('@@@@@@@@@@@@@@@@@@@@getUserData@@@@@@@@@@@@@@@');
      console.log(error);
      console.log('@@@@@@@@@@@@@@@@@@@@getUserData@@@@@@@@@@@@@@@');

      throw error;
    }
  }
}

export default UserRepository;
