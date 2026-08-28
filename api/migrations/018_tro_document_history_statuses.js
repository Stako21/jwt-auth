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
  if (await columnExists(pool, "document_history", "old_status")) {
    await pool.query(
      "ALTER TABLE document_history MODIFY COLUMN old_status VARCHAR(32) NULL",
    );
  }

  if (await columnExists(pool, "document_history", "new_status")) {
    await pool.query(
      "ALTER TABLE document_history MODIFY COLUMN new_status VARCHAR(32) NULL",
    );
  }
}
