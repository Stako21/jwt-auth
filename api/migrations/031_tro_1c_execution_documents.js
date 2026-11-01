async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tro_1c_execution_documents (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      portal_document_id INT NOT NULL,
      source_system VARCHAR(32) NOT NULL,
      document_1c_guid VARCHAR(36) NOT NULL,
      document_number VARCHAR(64) NOT NULL,
      document_date DATETIME NOT NULL,
      confirmed TINYINT(1) NOT NULL DEFAULT 0,
      shipped_from_warehouse TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_tro_execution_source_guid (source_system, document_1c_guid),
      KEY idx_tro_execution_portal_document (portal_document_id, document_date, id),
      CONSTRAINT fk_tro_execution_portal_document
        FOREIGN KEY (portal_document_id) REFERENCES documents(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (!(await columnExists(pool, "tro_document_details", "one_c_observed_at"))) {
    await pool.query(`
      ALTER TABLE tro_document_details
      ADD COLUMN one_c_observed_at DATETIME NULL AFTER one_c_stage_updated_at
    `);
  }
}

export async function down(pool) {
  await pool.query("DROP TABLE IF EXISTS tro_1c_execution_documents");
  if (await columnExists(pool, "tro_document_details", "one_c_observed_at")) {
    await pool.query(`
      ALTER TABLE tro_document_details
      DROP COLUMN one_c_observed_at
    `);
  }
}
