async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.query(
    `
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND index_name = ?
    LIMIT 1
    `,
    [tableName, indexName],
  );
  return rows.length > 0;
}

export async function up(pool) {
  if (
    !(await indexExists(
      pool,
      "bill_of_lading_report_rows",
      "idx_bill_lading_branch_updated",
    ))
  ) {
    await pool.query(`
      ALTER TABLE bill_of_lading_report_rows
      ADD INDEX idx_bill_lading_branch_updated (branch_id, updated_at)
    `);
  }
}
