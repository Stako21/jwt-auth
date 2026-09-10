async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

export async function up(pool) {
  if (!(await columnExists(pool, "balance_pages", "header_row"))) {
    await pool.query(`
      ALTER TABLE balance_pages
      ADD COLUMN header_row INT NULL AFTER file_name
    `);
  }

  if (!(await columnExists(pool, "balance_pages", "data_start_row"))) {
    await pool.query(`
      ALTER TABLE balance_pages
      ADD COLUMN data_start_row INT NULL AFTER header_row
    `);
  }

  if (!(await columnExists(pool, "balance_pages", "column_config"))) {
    await pool.query(`
      ALTER TABLE balance_pages
      ADD COLUMN column_config JSON NULL AFTER data_start_row
    `);
  }
}
