import pool from "../db.cjs";

class UserRepository {
  static async createUser({ userName, hashedPassword, role, city }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

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
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw error;
    }
  }

  static async getAllUsers() {
    const [rows] = await pool.query("SELECT id, name, role, city FROM users");

    return rows;
  }

  static async deleteUserById(userId) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query("DELETE FROM users WHERE id = ?", [userId]);
      return result.affectedRows > 0; // Вернет true, если пользователь удален
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateUserPassword(userId, hashedPassword) {
    const query = "UPDATE users SET password = ? WHERE id = ?";
    try {
      const [result] = await pool.query(query, [hashedPassword, userId]);
      return result;
    } catch (error) {
      throw error;
    }
  }
}

export default UserRepository;
