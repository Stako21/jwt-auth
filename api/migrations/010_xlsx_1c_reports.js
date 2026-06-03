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
  if (!(await columnExists(pool, "report_definitions", "report_type"))) {
    await pool.query(`
      ALTER TABLE report_definitions
      ADD COLUMN report_type VARCHAR(32) NOT NULL DEFAULT 'static-json' AFTER file_name
    `);
  }

  if (!(await columnExists(pool, "report_definitions", "sheet_name"))) {
    await pool.query(`
      ALTER TABLE report_definitions
      ADD COLUMN sheet_name VARCHAR(128) NULL AFTER report_type
    `);
  }

  if (!(await columnExists(pool, "report_definitions", "header_row"))) {
    await pool.query(`
      ALTER TABLE report_definitions
      ADD COLUMN header_row INT NULL AFTER sheet_name
    `);
  }

  if (!(await columnExists(pool, "report_definitions", "data_start_row"))) {
    await pool.query(`
      ALTER TABLE report_definitions
      ADD COLUMN data_start_row INT NULL AFTER header_row
    `);
  }
}
