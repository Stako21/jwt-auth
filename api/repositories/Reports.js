import pool from "../db.cjs";
import { ROLE_IDS } from "../utils/roles.js";

function getBranchScopeCondition(alias, role) {
  if ([ROLE_IDS.Admin, ROLE_IDS.Director].includes(Number(role))) {
    return `
      (
        ${alias}.branch_id = :branch_id
        OR ${alias}.branch_id IN (
          SELECT uba.branch_id
          FROM user_branch_access uba
          WHERE uba.user_id = :current_user_id
        )
      )
    `;
  }

  return `${alias}.branch_id = :branch_id`;
}

const SALES_REPORT_USER_PROJECTION = `
  u.id AS agent_id,
  u.NAME AS agent_login,
  u.user_name AS agent_name,
  u.role AS agent_role,
  agent_as.assortments AS agent_assortments,
  sup.id AS supervisor_id,
  sup.NAME AS supervisor_login,
  sup.user_name AS supervisor_name,
  sup.role AS supervisor_role,
  supervisor_as.assortments AS supervisor_assortments,
  manager.id AS manager_id,
  manager.NAME AS manager_login,
  manager.user_name AS manager_name,
  manager.role AS manager_role,
  manager_as.assortments AS manager_assortments
`;

const SALES_REPORT_HIERARCHY_JOINS = `
  LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
  LEFT JOIN users sup ON sup.id = h.parent_user_id
  LEFT JOIN user_hierarchy sup_h ON sup_h.child_user_id = sup.id
  LEFT JOIN users manager ON manager.id = sup_h.parent_user_id
  LEFT JOIN (
    SELECT user_id, branch_id,
           GROUP_CONCAT(DISTINCT NULLIF(TRIM(assortment_name), '')
             ORDER BY assortment_name SEPARATOR '||') AS assortments
    FROM sales_agents
    WHERE is_active_1c = 1
    GROUP BY user_id, branch_id
  ) agent_as ON agent_as.user_id = u.id AND agent_as.branch_id = sr.branch_id
  LEFT JOIN (
    SELECT user_id,
           GROUP_CONCAT(DISTINCT NULLIF(TRIM(assortment_name), '')
             ORDER BY assortment_name SEPARATOR '||') AS assortments
    FROM user_assortments
    GROUP BY user_id
  ) supervisor_as ON supervisor_as.user_id = sup.id
  LEFT JOIN (
    SELECT user_id,
           GROUP_CONCAT(DISTINCT NULLIF(TRIM(assortment_name), '')
             ORDER BY assortment_name SEPARATOR '||') AS assortments
    FROM user_assortments
    GROUP BY user_id
  ) manager_as ON manager_as.user_id = manager.id
`;

class ReportsRepository {
  static async getSalesReport({ userId, role, dateFrom, dateTo, branchId }) {
    let sql;
    const params = {
      date_from: dateFrom,
      date_to: dateTo,
      current_user_id: userId,
      branch_id: Number(branchId),
    };
    const branchScope = getBranchScopeCondition("sr", role);

    if (role === ROLE_IDS.TA) {
      sql = `
        SELECT
          sr.id,
          sr.report_date,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.customer,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,
          sr.branch_id,
          b.name AS branch_name,
          b.short_name AS branch_short_name,
          ${SALES_REPORT_USER_PROJECTION}
        FROM sales_reports sr
        JOIN branches b ON b.id = sr.branch_id
        JOIN users u ON u.id = sr.user_id
        ${SALES_REPORT_HIERARCHY_JOINS}
        WHERE
          sr.report_date BETWEEN :date_from AND :date_to
          AND ${branchScope}
          AND sr.user_id = :current_user_id
          AND EXISTS (
            SELECT 1
            FROM users u2
            WHERE u2.NAME = sr.login_agent
              AND u2.branch_id = sr.branch_id
          )
        ORDER BY b.name, sr.report_date, sr.document_number
      `;
    } else if (role === ROLE_IDS.SV) {
      sql = `
        SELECT
          sr.id,
          sr.report_date,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.customer,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,
          sr.branch_id,
          b.name AS branch_name,
          b.short_name AS branch_short_name,
          ${SALES_REPORT_USER_PROJECTION}
        FROM sales_reports sr
        JOIN branches b ON b.id = sr.branch_id
        JOIN users u ON u.id = sr.user_id
        ${SALES_REPORT_HIERARCHY_JOINS}
        WHERE
          sr.report_date BETWEEN :date_from AND :date_to
          AND ${branchScope}
          AND sr.user_id IN (
            SELECT child_user_id
            FROM user_hierarchy
            WHERE parent_user_id = :current_user_id
          )
          AND EXISTS (
            SELECT 1
            FROM users u2
            WHERE u2.NAME = sr.login_agent
              AND u2.branch_id = sr.branch_id
          )
        ORDER BY b.name, supervisor_name, agent_name, sr.report_date, sr.document_number
      `;
    } else if (role === ROLE_IDS.NTO) {
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
          sr.report_date,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.customer,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,
          sr.branch_id,
          b.name AS branch_name,
          b.short_name AS branch_short_name,
          ${SALES_REPORT_USER_PROJECTION}
        FROM sales_reports sr
        JOIN branches b ON b.id = sr.branch_id
        JOIN users u ON u.id = sr.user_id
        ${SALES_REPORT_HIERARCHY_JOINS}
        WHERE
          sr.report_date BETWEEN :date_from AND :date_to
          AND ${branchScope}
          AND (
            sr.user_id IN (SELECT child_user_id FROM user_tree)
            OR sr.user_id IN (
              SELECT uo.id
              FROM users uo
              LEFT JOIN user_hierarchy ho ON ho.child_user_id = uo.id
              WHERE uo.role = ${ROLE_IDS.TA}
                AND uo.branch_id = sr.branch_id
                AND ho.parent_user_id IS NULL
            )
            OR sr.user_id IN (
              SELECT ta.id
              FROM users ta
              JOIN user_hierarchy ta_h ON ta_h.child_user_id = ta.id
              JOIN users sv
                ON sv.id = ta_h.parent_user_id
               AND sv.role = ${ROLE_IDS.SV}
               AND sv.branch_id = ta.branch_id
              LEFT JOIN user_hierarchy sv_h ON sv_h.child_user_id = sv.id
              WHERE ta.role = ${ROLE_IDS.TA}
                AND ta.branch_id = sr.branch_id
                AND sv_h.parent_user_id IS NULL
            )
          )
          AND u.role = ${ROLE_IDS.TA}
          AND u.is_active = 1
          AND EXISTS (
            SELECT 1
            FROM users u2
            WHERE u2.NAME = sr.login_agent
              AND u2.branch_id = sr.branch_id
          )
        ORDER BY b.name, supervisor_name, agent_name, sr.report_date, sr.document_number
      `;
    } else if (role === ROLE_IDS.Accountant) {
      sql = `
        SELECT
          sr.id,
          sr.report_date,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.customer,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,
          sr.branch_id,
          b.name AS branch_name,
          b.short_name AS branch_short_name,
          ${SALES_REPORT_USER_PROJECTION}
        FROM sales_reports sr
        JOIN branches b ON b.id = sr.branch_id
        JOIN users u ON u.id = sr.user_id
        ${SALES_REPORT_HIERARCHY_JOINS}
        JOIN users me ON me.id = :current_user_id
        WHERE
          sr.report_date BETWEEN :date_from AND :date_to
          AND ${branchScope}
          AND u.role = ${ROLE_IDS.TA}
          AND u.is_active = 1
          AND (
            u.city = me.city
            OR h.parent_user_id IS NULL
          )
          AND EXISTS (
            SELECT 1
            FROM users u2
            WHERE u2.NAME = sr.login_agent
              AND u2.branch_id = sr.branch_id
          )
        ORDER BY b.name, supervisor_name, agent_name, sr.report_date, sr.document_number
      `;
    } else {
      sql = `
        SELECT
          sr.id,
          sr.report_date,
          sr.document_number,
          sr.document_date,
          sr.amount,
          sr.customer,
          sr.point_of_sale,
          sr.comment,
          sr.form2,
          sr.login_agent,
          sr.sales_agent_name,
          sr.status,
          sr.change_comment,
          sr.branch_id,
          b.name AS branch_name,
          b.short_name AS branch_short_name,
          ${SALES_REPORT_USER_PROJECTION}
        FROM sales_reports sr
        JOIN branches b ON b.id = sr.branch_id
        JOIN users u ON u.id = sr.user_id
        ${SALES_REPORT_HIERARCHY_JOINS}
        WHERE
          sr.report_date BETWEEN :date_from AND :date_to
          AND ${branchScope}
          AND EXISTS (
            SELECT 1
            FROM users u2
            WHERE u2.NAME = sr.login_agent
              AND u2.branch_id = sr.branch_id
          )
        ORDER BY b.name, supervisor_name, agent_name, sr.report_date, sr.document_number
      `;
    }

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async getLastImportDate({ userId, role, branchId }) {
    const branchScope = getBranchScopeCondition("report_imports", role);
    const [rows] = await pool.query(
      `
      SELECT MAX(imported_at) AS lastUpdate
      FROM report_imports
      WHERE ${branchScope}
      `,
      {
        current_user_id: userId,
        branch_id: Number(branchId),
      },
    );

    return rows[0]?.lastUpdate || null;
  }

  static async getReportDateRange({ userId, role, branchId }) {
    const branchScope = getBranchScopeCondition("sales_reports", role);
    const [rows] = await pool.query(
      `
      SELECT
        MIN(report_date) AS minDate,
        MAX(report_date) AS maxDate
      FROM sales_reports
      WHERE ${branchScope}
      `,
      {
        current_user_id: userId,
        branch_id: Number(branchId),
      },
    );

    return rows[0] || { minDate: null, maxDate: null };
  }
}

export default ReportsRepository;
