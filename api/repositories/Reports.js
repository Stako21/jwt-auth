import pool from "../db.cjs";
import { ROLE_IDS } from "../../client/src/utils/roles.js"; 
// если не хочешь тянуть с фронта — просто захардкодь роли

class ReportsRepository {
  static async getSalesReport({ userId, role, reportDate }) {
    let sql;
    let params = { report_date: reportDate, current_user_id: userId };

    // === TA =====================================================
    if (role === ROLE_IDS.TA) {
      sql = `
        SELECT
          sr.id,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,

          u.id        AS agent_id,
          u.NAME      AS agent_login,
          u.user_name AS agent_name,

          sup.id        AS supervisor_id,
          sup.user_name AS supervisor_name

        FROM sales_reports sr
        JOIN users u ON u.id = sr.user_id
        LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
        LEFT JOIN users sup ON sup.id = h.parent_user_id

        WHERE
          sr.report_date = :report_date
          AND sr.user_id = :current_user_id
          AND EXISTS (
            SELECT 1 FROM users u2 WHERE u2.NAME = sr.login_agent
          )
        ORDER BY sr.document_number
      `;
    }

    // === SV =====================================================
    else if (role === ROLE_IDS.SV) {
      sql = `
        SELECT
          sr.id,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,

          u.id        AS agent_id,
          u.NAME      AS agent_login,
          u.user_name AS agent_name,

          sup.id        AS supervisor_id,
          sup.user_name AS supervisor_name

        FROM sales_reports sr
        JOIN users u ON u.id = sr.user_id
        LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
        LEFT JOIN users sup ON sup.id = h.parent_user_id

        WHERE
          sr.report_date = :report_date
          AND sr.user_id IN (
            SELECT child_user_id
            FROM user_hierarchy
            WHERE parent_user_id = :current_user_id
          )
          AND EXISTS (
            SELECT 1 FROM users u2 WHERE u2.NAME = sr.login_agent
          )
        ORDER BY supervisor_name, agent_name, sr.document_number
      `;
    }

    // === NTO ====================================================
    else if (role === ROLE_IDS.NTO) {
      sql = `
        WITH RECURSIVE user_tree AS (
          SELECT child_user_id
          FROM user_hierarchy
          WHERE parent_user_id = :current_user_id

          UNION ALL

          SELECT uh.child_user_id
          FROM user_hierarchy uh
          JOIN user_tree ut ON uh.parent_user_id = ut.child_user_id
        )
        SELECT
          sr.id,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,

          u.id        AS agent_id,
          u.NAME      AS agent_login,
          u.user_name AS agent_name,

          sup.id        AS supervisor_id,
          sup.user_name AS supervisor_name

        FROM sales_reports sr
        JOIN users u ON u.id = sr.user_id
        LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
        LEFT JOIN users sup ON sup.id = h.parent_user_id

        WHERE
          sr.report_date = :report_date
          AND sr.user_id IN (SELECT child_user_id FROM user_tree)
          AND EXISTS (
            SELECT 1 FROM users u2 WHERE u2.NAME = sr.login_agent
          )
        ORDER BY supervisor_name, agent_name, sr.document_number
      `;
    }

    // === Director / Admin =====================================
    else {
      sql = `
        SELECT
          sr.id,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,

          u.id        AS agent_id,
          u.NAME      AS agent_login,
          u.user_name AS agent_name,

          sup.id        AS supervisor_id,
          sup.user_name AS supervisor_name

        FROM sales_reports sr
        JOIN users u ON u.id = sr.user_id
        LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
        LEFT JOIN users sup ON sup.id = h.parent_user_id

        WHERE
          sr.report_date = :report_date
          AND EXISTS (
            SELECT 1 FROM users u2 WHERE u2.NAME = sr.login_agent
          )
        ORDER BY supervisor_name, agent_name, sr.document_number
      `;
    }

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async getLastImportDate() {
    const [rows] = await pool.query(`
      SELECT MAX(imported_at) AS lastUpdate
      FROM report_imports
    `);
    return rows[0]?.lastUpdate || null;
  }
}

export default ReportsRepository;
