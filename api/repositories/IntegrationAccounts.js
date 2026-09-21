import pool from "../db.cjs";

export default class IntegrationAccountsRepository {
  static async list() {
    const [accounts] = await pool.query(`
      SELECT ia.id, ia.login, ia.display_name, ia.issued_to_name, ia.is_active,
             ia.can_process_requests, ia.can_sync_statuses,
             ia.last_login_at, ia.last_used_at, ia.created_at, ia.updated_at
      FROM integration_accounts ia
      ORDER BY ia.display_name, ia.login
    `);
    const [cities] = await pool.query(`
      SELECT iac.integration_account_id, c.id, c.name, c.branch_id,
             b.name AS branch_name
      FROM integration_account_cities iac
      JOIN cities c ON c.id = iac.city_id
      JOIN branches b ON b.id = c.branch_id
      ORDER BY b.name, c.name
    `);
    return { accounts, cities };
  }

  static async cityOptions() {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.branch_id, b.name AS branch_name
      FROM cities c
      JOIN branches b ON b.id = c.branch_id
      WHERE c.is_active = 1 AND b.is_active = 1
      ORDER BY b.name, c.name
    `);
    return rows;
  }

  static async findByLogin(login) {
    const [[row]] = await pool.query(
      "SELECT * FROM integration_accounts WHERE LOWER(login) = LOWER(?) LIMIT 1",
      [login],
    );
    return row || null;
  }

  static async findActiveWithScope(id) {
    const [[account]] = await pool.query(
      `SELECT id, login, display_name, is_active, can_process_requests, can_sync_statuses
       FROM integration_accounts WHERE id = ? AND is_active = 1 LIMIT 1`,
      [id],
    );
    if (!account) return null;
    const [cities] = await pool.query(
      `SELECT c.id AS city_id, c.branch_id
       FROM integration_account_cities iac
       JOIN cities c ON c.id = iac.city_id AND c.is_active = 1
       JOIN branches b ON b.id = c.branch_id AND b.is_active = 1
       WHERE iac.integration_account_id = ?`,
      [id],
    );
    return { ...account, cities };
  }

  static async touchLogin(id) {
    await pool.query("UPDATE integration_accounts SET last_login_at = NOW(), last_used_at = NOW() WHERE id = ?", [id]);
  }

  static async touchUsed(id) {
    await pool.query("UPDATE integration_accounts SET last_used_at = NOW() WHERE id = ?", [id]);
  }

  static async save({ id, login, passwordHash, displayName, issuedToName, isActive,
    canProcessRequests, canSyncStatuses, cityIds, actorUserId }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let accountId = Number(id) || null;
      if (accountId) {
        const passwordSql = passwordHash ? ", password_hash = ?" : "";
        const params = [login, displayName, issuedToName, isActive, canProcessRequests,
          canSyncStatuses, actorUserId];
        if (passwordHash) params.push(passwordHash);
        params.push(accountId);
        const [result] = await connection.query(
          `UPDATE integration_accounts SET login = ?, display_name = ?, issued_to_name = ?,
             is_active = ?, can_process_requests = ?, can_sync_statuses = ?, updated_by_user_id = ?
             ${passwordSql} WHERE id = ?`,
          params,
        );
        if (!result.affectedRows) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      } else {
        const [result] = await connection.query(
          `INSERT INTO integration_accounts
           (login, password_hash, display_name, issued_to_name, is_active,
            can_process_requests, can_sync_statuses, created_by_user_id, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [login, passwordHash, displayName, issuedToName, isActive,
            canProcessRequests, canSyncStatuses, actorUserId, actorUserId],
        );
        accountId = Number(result.insertId);
      }
      await connection.query("DELETE FROM integration_account_cities WHERE integration_account_id = ?", [accountId]);
      for (const cityId of cityIds) {
        await connection.query(
          "INSERT INTO integration_account_cities (integration_account_id, city_id) VALUES (?, ?)",
          [accountId, cityId],
        );
      }
      await connection.commit();
      return accountId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
