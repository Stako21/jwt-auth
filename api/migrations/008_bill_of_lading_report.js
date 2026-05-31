import { defaultBootstrapBranchConfig } from "../config/bootstrapBranchConfig.js";

function serializeAllowedRoles(allowedRoles) {
  if (!Array.isArray(allowedRoles)) return null;

  const normalized = [...new Set(allowedRoles.map(Number))]
    .filter((roleId) => Number.isInteger(roleId) && roleId > 0)
    .sort((a, b) => a - b);

  return JSON.stringify(normalized);
}

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bill_of_lading_report_rows (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      report_date DATE NOT NULL,
      warehouse_name VARCHAR(255) NULL,
      picker VARCHAR(255) NULL,
      document_number VARCHAR(128) NOT NULL DEFAULT '',
      document_datetime DATETIME NULL,
      scan_datetime DATETIME NOT NULL,
      documents_count INT NOT NULL DEFAULT 0,
      rows_count INT NOT NULL DEFAULT 0,
      weight DECIMAL(14, 3) NOT NULL DEFAULT 0,
      amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_bill_of_lading_branch_date (branch_id, report_date),
      KEY idx_bill_of_lading_scan_datetime (scan_datetime),
      CONSTRAINT fk_bill_of_lading_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    INSERT INTO import_sources
      (source_key, file_name, delete_after_success, is_active)
    VALUES
      ('loadBillOfLadingReport', 'BillOfLading.json', 0, 1)
    ON DUPLICATE KEY UPDATE
      file_name = VALUES(file_name),
      delete_after_success = VALUES(delete_after_success),
      is_active = VALUES(is_active)
  `);

  await pool.query(`
    INSERT INTO scheduler_tasks
      (task_key, label, interval_ms, is_active)
    VALUES
      ('loadBillOfLadingReport', 'Load bill of lading report', 300000, 1)
    ON DUPLICATE KEY UPDATE
      label = VALUES(label)
  `);

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
