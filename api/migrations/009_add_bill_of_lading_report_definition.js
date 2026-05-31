import { defaultBootstrapBranchConfig } from "../config/bootstrapBranchConfig.js";

function serializeAllowedRoles(allowedRoles) {
  if (!Array.isArray(allowedRoles)) return null;

  const normalized = [...new Set(allowedRoles.map(Number))]
    .filter((roleId) => Number.isInteger(roleId) && roleId > 0)
    .sort((a, b) => a - b);

  return JSON.stringify(normalized);
}

export async function up(pool) {
  const reportConfig = defaultBootstrapBranchConfig.reports.find(
    (report) => report.reportKey === "report-bill-of-lading",
  );

  if (!reportConfig) return;

  const [branches] = await pool.query(`
    SELECT id
    FROM branches
  `);

  for (const branch of branches) {
    await pool.query(
      `
      INSERT INTO report_definitions (
        branch_id,
        report_key,
        route,
        menu_title,
        file_name,
        allowed_roles,
        is_active,
        sort_order
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM report_definitions
        WHERE branch_id = ?
          AND report_key = ?
      )
      `,
      [
        branch.id,
        reportConfig.reportKey,
        reportConfig.route,
        reportConfig.menuTitle,
        reportConfig.fileName,
        serializeAllowedRoles(reportConfig.allowedRoles),
        reportConfig.isActive ? 1 : 0,
        reportConfig.sortOrder,
        branch.id,
        reportConfig.reportKey,
      ],
    );
  }
}
