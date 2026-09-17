import pool from "../db.cjs";

class UserRepository {
  static async insertUser(
    executor,
    {
      userName,
      user_name,
      userGuid,
      multiAssortmentAllowed,
      hashedPassword,
      role,
      city,
      branchId,
    },
  ) {
    const [insertResult] = await executor.query(
      `
      INSERT INTO users (
        name, user_name, user_guid, multi_assortment_allowed,
        password, role, city, branch_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userName || null,
        user_name || null,
        userGuid || null,
        multiAssortmentAllowed ? 1 : 0,
        hashedPassword,
        role,
        city,
        branchId,
      ],
    );

    const userId = insertResult.insertId;
    const [rows] = await executor.query(
      "SELECT * FROM users WHERE id = ? AND branch_id = ?",
      [userId, branchId],
    );

    return rows[0] || null;
  }

  static async createUser({
    userName,
    user_name,
    userGuid,
    multiAssortmentAllowed,
    hashedPassword,
    role,
    city,
    branchId,
  }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const user = await this.insertUser(connection, {
        userName,
        user_name,
        userGuid,
        multiAssortmentAllowed,
        hashedPassword,
        role,
        city,
        branchId,
      });

      await connection.commit();
      return user;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getUserData(userName) {
    if (!userName) return null;
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE name = ? AND is_active = 1",
      [userName],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async getUserById(id) {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE id = ? AND is_active = 1",
      [id],
    );
    return rows[0] || null;
  }

  static async getActiveUserByIdInBranch(id, branchId) {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM users
      WHERE id = ?
        AND branch_id = ?
        AND is_active = 1
      `,
      [id, branchId],
    );
    return rows[0] || null;
  }

  static async getUserByUserName(user_name) {
    if (!user_name) return null;
    const [rows] = await pool.query("SELECT * FROM users WHERE user_name = ?", [
      user_name,
    ]);
    return rows.length > 0 ? rows[0] : null;
  }

  static async getUserByGuid(userGuid, branchId) {
    if (!userGuid) return null;
    const [rows] = await pool.query(
      `
      SELECT *
      FROM users
      WHERE user_guid = ?
        AND branch_id = ?
      LIMIT 1
      `,
      [userGuid, branchId],
    );
    return rows[0] || null;
  }

  static async getAllUsers(branchId) {
    const [rows] = await pool.query(
      `
      SELECT id, name, user_name, current_agent_guid, user_guid,
             multi_assortment_allowed,
             role, city, branch_id, is_active
      FROM users
      WHERE is_active = 1
        AND branch_id = ?
      `,
      [branchId],
    );

    return rows;
  }

  static async getSalesAgents(branchId) {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        user_id,
        login,
        route_guid,
        route_name,
        full_name,
        current_agent_guid,
        assortment_guid,
        assortment_name,
        supervisor_name,
        supervisor_guid,
        city,
        regional_division_guid,
        supervisor_id,
        branch_id,
        last_seen_at,
        is_active_1c
      FROM sales_agents
      WHERE branch_id = ?
      `,
      [branchId],
    );

    return rows.length > 0 ? rows : [];
  }

  static async deleteUserById(userId, branchId) {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        `
        UPDATE users
        SET is_active = 0, deleted_at = NOW()
        WHERE id = ?
          AND branch_id = ?
        `,
        [userId, branchId],
      );
      return result.affectedRows > 0;
    } finally {
      connection.release();
    }
  }

  static async updateUserPassword(userId, hashedPassword, branchId) {
    const [result] = await pool.query(
      "UPDATE users SET password = ? WHERE id = ? AND branch_id = ?",
      [hashedPassword, userId, branchId],
    );
    return result;
  }

  static async updateUserById(
    userId,
    { userName, user_name, userGuid, multiAssortmentAllowed, role, city },
    branchId,
    executor = pool,
  ) {
    const [result] = await executor.query(
      `
      UPDATE users
      SET name = ?, user_name = ?, user_guid = ?,
          multi_assortment_allowed = ?, role = ?, city = ?
      WHERE id = ?
        AND branch_id = ?
      `,
      [
        userName || null,
        user_name || null,
        userGuid || null,
        multiAssortmentAllowed ? 1 : 0,
        role,
        city,
        userId,
        branchId,
      ],
    );
    return result;
  }

  static async setParent(childId, parentId, branchId, executor = pool) {
    const [result] = await executor.query(
      `
      INSERT INTO user_hierarchy (parent_user_id, child_user_id)
      SELECT ?, ?
      FROM users p, users c
      WHERE p.id = ?
        AND c.id = ?
        AND p.is_active = 1
        AND c.is_active = 1
        AND p.branch_id = ?
        AND c.branch_id = ?
      ON DUPLICATE KEY UPDATE parent_user_id = VALUES(parent_user_id)
      `,
      [parentId, childId, parentId, childId, branchId, branchId],
    );
    return result;
  }

  static async removeParent(childId, branchId) {
    const [result] = await pool.query(
      `
      DELETE h
      FROM user_hierarchy h
      JOIN users u ON u.id = h.child_user_id
      WHERE h.child_user_id = ?
        AND u.branch_id = ?
      `,
      [childId, branchId],
    );
    return result;
  }

  static async getDirectSupervisor(childId, branchId) {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.user_name,
        p.role,
        p.city,
        p.branch_id
      FROM user_hierarchy h
      JOIN users c
        ON c.id = h.child_user_id
       AND c.is_active = 1
       AND c.branch_id = ?
      JOIN users p
        ON p.id = h.parent_user_id
       AND p.is_active = 1
       AND p.branch_id = c.branch_id
      WHERE h.child_user_id = ?
      LIMIT 1
      `,
      [branchId, childId],
    );
    return rows[0] || null;
  }

  static async getDirectSubordinates(parentId, branchId) {
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.user_name,
        c.role,
        c.city,
        c.branch_id
      FROM user_hierarchy h
      JOIN users p
        ON p.id = h.parent_user_id
       AND p.is_active = 1
       AND p.branch_id = ?
      JOIN users c
        ON c.id = h.child_user_id
       AND c.is_active = 1
       AND c.branch_id = p.branch_id
      WHERE h.parent_user_id = ?
      ORDER BY c.id
      `,
      [branchId, parentId],
    );
    return rows;
  }

  static async findAllWithHierarchy(branchId) {
    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.NAME AS name,
        u.user_name,
        u.user_guid,
        u.multi_assortment_allowed,
        u.role,
        u.city,
        u.branch_id,
        h.parent_user_id,
        p.user_name AS parent_name
      FROM users u
      LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
      LEFT JOIN users p
        ON p.id = h.parent_user_id
       AND p.is_active = 1
       AND p.branch_id = u.branch_id
      WHERE u.is_active = 1
        AND u.branch_id = ?
      ORDER BY u.role, u.user_name
      `,
      [branchId],
    );
    return [rows];
  }

  static async getSalesAgentPositionsForUsers(userIds, branchId) {
    if (!userIds.length) return [];
    const [rows] = await pool.query(
      `SELECT
         id, user_id, login, route_guid, route_name, current_agent_guid,
         full_name, assortment_guid, assortment_name, supervisor_guid,
         supervisor_name, city, is_active_1c
       FROM sales_agents
       WHERE branch_id = ? AND user_id IN (?)
       ORDER BY is_active_1c DESC, assortment_name, login`,
      [branchId, userIds],
    );
    return rows;
  }

  static async getUserAssortmentsForUsers(userIds, branchId, executor = pool) {
    if (!userIds.length) return [];
    const [rows] = await executor.query(
      `SELECT ua.user_id, ua.assortment_guid, ua.assortment_name
       FROM user_assortments ua
       JOIN users u ON u.id = ua.user_id
       WHERE u.branch_id = ? AND ua.user_id IN (?)
       ORDER BY ua.assortment_name, ua.assortment_guid`,
      [branchId, userIds],
    );
    return rows;
  }
}

export default UserRepository;
