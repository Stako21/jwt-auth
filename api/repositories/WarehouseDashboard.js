import pool from "../db.cjs";
import { ROLE_IDS } from "../utils/roles.js";

export default class WarehouseDashboardRepository {
  static async warehouseOptions(branchId, executor = pool) {
    const [rows] = await executor.query(
      `SELECT id, warehouse_guid AS warehouseGuid,
              warehouse_name AS warehouseName, is_active AS isActive
       FROM warehouses
       WHERE branch_id = ? AND is_active = 1
       ORDER BY warehouse_name, id`,
      [branchId],
    );
    return rows;
  }

  static async listAccounts(branchId) {
    const [accounts] = await pool.query(
      `SELECT id, NAME AS login, user_name AS displayName,
              is_active AS isActive
       FROM users
       WHERE branch_id = ? AND role = ?
       ORDER BY user_name, NAME, id`,
      [branchId, ROLE_IDS.WarehouseDashboard],
    );
    const [access] = await pool.query(
      `SELECT uwa.user_id AS userId, w.id, w.warehouse_guid AS warehouseGuid,
              w.warehouse_name AS warehouseName, w.is_active AS isActive
       FROM user_warehouse_access uwa
       JOIN users u ON u.id = uwa.user_id
       JOIN warehouses w ON w.id = uwa.warehouse_id AND w.branch_id = u.branch_id
       WHERE u.branch_id = ? AND u.role = ?
       ORDER BY w.warehouse_name, w.id`,
      [branchId, ROLE_IDS.WarehouseDashboard],
    );
    return { accounts, access };
  }

  static async findLogin(login) {
    const [[row]] = await pool.query(
      "SELECT id, role FROM users WHERE LOWER(NAME) = LOWER(?) LIMIT 1",
      [login],
    );
    return row || null;
  }

  static async saveAccount({
    id,
    branchId,
    login,
    displayName,
    passwordHash,
    isActive,
    warehouseIds,
  }) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      let accountId = Number(id) || null;
      if (accountId) {
        const values = [login, displayName, isActive ? 1 : 0];
        let passwordSql = "";
        if (passwordHash) {
          passwordSql = ", PASSWORD = ?";
          values.push(passwordHash);
        }
        values.push(accountId, branchId, ROLE_IDS.WarehouseDashboard);
        const [result] = await connection.query(
          `UPDATE users
           SET NAME = ?, user_name = ?, is_active = ?${passwordSql}
           WHERE id = ? AND branch_id = ? AND role = ?`,
          values,
        );
        if (!result.affectedRows) {
          throw Object.assign(new Error("ACCOUNT_NOT_FOUND"), {
            code: "ACCOUNT_NOT_FOUND",
          });
        }
      } else {
        const [result] = await connection.query(
          `INSERT INTO users
             (NAME, user_name, PASSWORD, role, city, branch_id, is_active)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          [
            login,
            displayName,
            passwordHash,
            ROLE_IDS.WarehouseDashboard,
            branchId,
            isActive ? 1 : 0,
          ],
        );
        accountId = Number(result.insertId);
      }

      await connection.query(
        "DELETE FROM user_warehouse_access WHERE user_id = ?",
        [accountId],
      );
      for (const warehouseId of warehouseIds) {
        await connection.query(
          `INSERT INTO user_warehouse_access (user_id, warehouse_id)
           VALUES (?, ?)`,
          [accountId, warehouseId],
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

  static async getAllowedWarehouses(userId, branchId) {
    const [rows] = await pool.query(
      `SELECT w.id, w.warehouse_guid AS warehouseGuid,
              w.warehouse_name AS warehouseName
       FROM users u
       JOIN user_warehouse_access uwa ON uwa.user_id = u.id
       JOIN warehouses w
         ON w.id = uwa.warehouse_id
        AND w.branch_id = u.branch_id
        AND w.is_active = 1
       WHERE u.id = ? AND u.branch_id = ? AND u.role = ? AND u.is_active = 1
       ORDER BY w.warehouse_name, w.id`,
      [userId, branchId, ROLE_IDS.WarehouseDashboard],
    );
    return rows;
  }

  static async getShiftRows(branchId, warehouseGuid, reportDate) {
    const [rows] = await pool.query(
      `SELECT picker_guid AS pickerGuid,
              MAX(NULLIF(TRIM(picker), '')) AS picker,
              SUM(documents_count) AS documentsCount,
              SUM(rows_count) AS rowsCount,
              SUM(weight) AS weight
       FROM bill_of_lading_report_rows
       WHERE branch_id = ?
         AND warehouse_guid = ?
         AND report_date = ?
         AND picker_guid IS NOT NULL
         AND TRIM(picker_guid) <> ''
       GROUP BY picker_guid`,
      [branchId, warehouseGuid, reportDate],
    );
    const [[meta]] = await pool.query(
      `SELECT MAX(updated_at) AS dataUpdatedAt
       FROM bill_of_lading_report_rows
       WHERE branch_id = ? AND warehouse_guid = ? AND report_date = ?`,
      [branchId, warehouseGuid, reportDate],
    );
    return { rows, dataUpdatedAt: meta?.dataUpdatedAt || null };
  }
}
