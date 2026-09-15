async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function addColumn(pool, name, definition) {
  if (!(await columnExists(pool, "tro_document_details", name))) {
    await pool.query(`ALTER TABLE tro_document_details ADD COLUMN ${definition}`);
  }
}

export async function up(pool) {
  await addColumn(
    pool,
    "rejected_by_1c_guid",
    "rejected_by_1c_guid VARCHAR(36) NULL AFTER last_sync_error",
  );
  await addColumn(
    pool,
    "rejected_by_1c_name",
    "rejected_by_1c_name VARCHAR(150) NULL AFTER rejected_by_1c_guid",
  );
}

export async function down(pool) {
  if (await columnExists(pool, "tro_document_details", "rejected_by_1c_name")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP COLUMN rejected_by_1c_name",
    );
  }
  if (await columnExists(pool, "tro_document_details", "rejected_by_1c_guid")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP COLUMN rejected_by_1c_guid",
    );
  }
}
