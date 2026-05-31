import { defaultBootstrapBranchConfig } from "../config/bootstrapBranchConfig.js";

async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
    LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows.length > 0;
}

function serializeAllowedRoles(allowedRoles) {
  if (!Array.isArray(allowedRoles)) {
    return null;
  }

  const normalized = [...new Set(allowedRoles.map(Number))]
    .filter((roleId) => Number.isInteger(roleId) && roleId > 0)
    .sort((a, b) => a - b);

  return JSON.stringify(normalized);
}

export async function up(pool) {
  if (!(await columnExists(pool, "report_definitions", "allowed_roles"))) {
    await pool.query(`
      ALTER TABLE report_definitions
      ADD COLUMN allowed_roles TEXT NULL AFTER file_name
    `);
  }

  for (const report of defaultBootstrapBranchConfig.reports) {
    await pool.query(
      `
      UPDATE report_definitions
      SET allowed_roles = ?
      WHERE report_key = ?
      `,
      [serializeAllowedRoles(report.allowedRoles), report.reportKey],
    );
  }
}
