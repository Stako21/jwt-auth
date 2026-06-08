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

export async function up(pool) {
  if (!(await columnExists(pool, "report_definitions", "scheduled_import_enabled"))) {
    await pool.query(`
      ALTER TABLE report_definitions
      ADD COLUMN scheduled_import_enabled TINYINT(1) NOT NULL DEFAULT 0
      AFTER retention_days
    `);
  }

  await pool.query(`
    UPDATE report_definitions
    SET scheduled_import_enabled = 1
    WHERE report_type = 'xlsx-1c-sales'
      AND report_key IN ('report-montblanc-sales', 'report-lacmi-sales')
  `);

  await pool.query(`
    INSERT INTO scheduler_tasks
      (task_key, label, interval_ms, is_active)
    VALUES
      ('loadScheduledXlsx1cSalesReports', 'Load scheduled XLSX 1C sales reports', 300000, 1)
    ON DUPLICATE KEY UPDATE
      label = VALUES(label)
  `);
}
