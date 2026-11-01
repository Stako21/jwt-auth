async function columnExists(pool) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'tro_document_details'
       AND column_name = 'status_sync_requested_at' LIMIT 1`,
  );
  return rows.length > 0;
}

export async function up(pool) {
  if (!(await columnExists(pool))) {
    await pool.query(`ALTER TABLE tro_document_details
      ADD COLUMN status_sync_requested_at DATETIME(3) NULL DEFAULT NULL`);
  }
}

export async function down(pool) {
  if (await columnExists(pool)) {
    await pool.query("ALTER TABLE tro_document_details DROP COLUMN status_sync_requested_at");
  }
}
