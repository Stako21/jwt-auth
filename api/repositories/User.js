import pool from "../db.cjs";

class UserRepository {
  static async createUser({ userName, user_name, hashedPassword, role, city }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [insertResult] = await connection.query(
        "INSERT INTO users (name, user_name, password, role, city) VALUES (?, ?, ?, ?, ?)",
        [userName || null, user_name || null, hashedPassword, role, city]
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
    if (!userName) return null;
    try {
      const [rows] = await pool.query("SELECT * FROM users WHERE name = ?", [
        userName,
      ]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw error;
    }
  }

  static async getUserById(id) {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    return rows[0] || null;
  }
  
  static async getUserByUserName(user_name) {
    if (!user_name) return null;
    try {
      const [rows] = await pool.query(
        "SELECT * FROM users WHERE user_name = ?",
        [user_name]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw error;
    }
  }

  static async getAllUsers() {
    const [rows] = await pool.query(
      "SELECT id, name, user_name, role, city FROM users"
    );

    return rows;
  }

  static async getSalesAgents() {
    const [rows] = await pool.query(
      "SELECT id, user_id, login, full_name, supervisor_name, city, supervisor_id FROM sales_agents"
    );

    return rows.length > 0 ? rows : [];
  }

  static async deleteUserById(userId) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        "DELETE FROM users WHERE id = ?",
        [userId]
      );
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

  static async updateUserById(userId, { userName, user_name, role, city }) {
    const query =
      "UPDATE users SET name = ?, user_name = ?, role = ?, city = ? WHERE id = ?";
    try {
      const [result] = await pool.query(query, [
        userName || null,
        user_name || null,
        role,
        city,
        userId,
      ]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async setParent(childId, parentId) {
    const query = `
      INSERT INTO user_hierarchy (parent_user_id, child_user_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE parent_user_id = VALUES(parent_user_id)
    `;

    try {
      const [result] = await pool.query(query, [parentId, childId]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async removeParent(childId) {
    const query = `
      DELETE FROM user_hierarchy
      WHERE child_user_id = ?
    `;

    try {
      const [result] = await pool.query(query, [childId]);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async findAllWithHierarchy() {
    const query = `
      SELECT
        u.id,
        u.NAME AS name,
        u.user_name,
        u.role,
        u.city,
        h.parent_user_id,
        p.user_name AS parent_name
      FROM users u
      LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
      LEFT JOIN users p ON p.id = h.parent_user_id
      ORDER BY u.role, u.user_name
    `;

    try {
      const [rows] = await pool.query(query);
      return [rows];
    } catch (error) {
      throw error;
    }
  }

}

export default UserRepository;
