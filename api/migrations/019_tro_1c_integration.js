async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [tableName, indexName],
  );
  return rows.length > 0;
}

async function constraintExists(pool, constraintName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ? LIMIT 1`,
    [constraintName],
  );
  return rows.length > 0;
}

async function addColumn(pool, name, definition) {
  if (!(await columnExists(pool, "tro_document_details", name))) {
    await pool.query(`ALTER TABLE tro_document_details ADD COLUMN ${definition}`);
  }
}

export async function up(pool) {
  await addColumn(pool, "document_1c_guid", "document_1c_guid VARCHAR(36) NULL AFTER movement_type");
  await addColumn(pool, "document_1c_date", "document_1c_date DATETIME NULL AFTER document_1c_guid");
  await addColumn(pool, "source_system", "source_system VARCHAR(32) NULL AFTER document_1c_date");
  await addColumn(pool, "executor_sales_agent_id", "executor_sales_agent_id INT NULL AFTER executor_name");
  await addColumn(pool, "executor_agent_guid", "executor_agent_guid VARCHAR(36) NULL AFTER executor_sales_agent_id");
  await addColumn(pool, "warehouse_guid", "warehouse_guid VARCHAR(36) NULL AFTER executor_agent_guid");
  await addColumn(pool, "one_c_stage", "one_c_stage VARCHAR(32) NULL AFTER warehouse_guid");
  await addColumn(pool, "one_c_stage_updated_at", "one_c_stage_updated_at DATETIME NULL AFTER one_c_stage");
  await addColumn(pool, "last_synced_at", "last_synced_at DATETIME NULL AFTER one_c_stage_updated_at");
  await addColumn(pool, "last_sync_error", "last_sync_error TEXT NULL AFTER last_synced_at");

  if (!(await indexExists(pool, "tro_document_details", "uq_tro_details_1c_document"))) {
    await pool.query(
      `ALTER TABLE tro_document_details
       ADD UNIQUE KEY uq_tro_details_1c_document (source_system, document_1c_guid)`,
    );
  }
  if (!(await indexExists(pool, "tro_document_details", "idx_tro_details_1c_pending"))) {
    await pool.query(
      `ALTER TABLE tro_document_details
       ADD KEY idx_tro_details_1c_pending (source_system, one_c_stage, document_1c_guid)`,
    );
  }
  if (!(await indexExists(pool, "tro_document_details", "idx_tro_details_executor_agent"))) {
    await pool.query(
      `ALTER TABLE tro_document_details
       ADD KEY idx_tro_details_executor_agent (executor_sales_agent_id)`,
    );
  }
  if (!(await constraintExists(pool, "fk_tro_details_executor_agent"))) {
    await pool.query(
      `ALTER TABLE tro_document_details
       ADD CONSTRAINT fk_tro_details_executor_agent
       FOREIGN KEY (executor_sales_agent_id) REFERENCES sales_agents(id) ON DELETE SET NULL`,
    );
  }
}

export async function down(pool) {
  if (await constraintExists(pool, "fk_tro_details_executor_agent")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP FOREIGN KEY fk_tro_details_executor_agent",
    );
  }
  for (const indexName of [
    "idx_tro_details_executor_agent",
    "idx_tro_details_1c_pending",
    "uq_tro_details_1c_document",
  ]) {
    if (await indexExists(pool, "tro_document_details", indexName)) {
      await pool.query(`ALTER TABLE tro_document_details DROP INDEX ${indexName}`);
    }
  }
  for (const columnName of [
    "last_sync_error",
    "last_synced_at",
    "one_c_stage_updated_at",
    "one_c_stage",
    "warehouse_guid",
    "executor_agent_guid",
    "executor_sales_agent_id",
    "source_system",
    "document_1c_date",
    "document_1c_guid",
  ]) {
    if (await columnExists(pool, "tro_document_details", columnName)) {
      await pool.query(`ALTER TABLE tro_document_details DROP COLUMN ${columnName}`);
    }
  }
}
