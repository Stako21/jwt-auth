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
  await addColumn(pool, "executor_guid", "executor_guid VARCHAR(36) NULL AFTER executor_name");

  if (await constraintExists(pool, "fk_tro_details_executor_agent")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP FOREIGN KEY fk_tro_details_executor_agent",
    );
  }
  if (await indexExists(pool, "tro_document_details", "idx_tro_details_executor_agent")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP INDEX idx_tro_details_executor_agent",
    );
  }

  if (
    await columnExists(pool, "tro_document_details", "executor_sales_agent_id")
    && !(await columnExists(pool, "tro_document_details", "one_c_sales_agent_id"))
  ) {
    await pool.query(
      `ALTER TABLE tro_document_details
       CHANGE COLUMN executor_sales_agent_id one_c_sales_agent_id INT NULL`,
    );
  }
  if (
    await columnExists(pool, "tro_document_details", "executor_agent_guid")
    && !(await columnExists(pool, "tro_document_details", "one_c_sales_agent_guid"))
  ) {
    await pool.query(
      `ALTER TABLE tro_document_details
       CHANGE COLUMN executor_agent_guid one_c_sales_agent_guid VARCHAR(36) NULL`,
    );
  }

  await addColumn(
    pool,
    "one_c_sales_agent_name",
    "one_c_sales_agent_name VARCHAR(150) NULL AFTER one_c_sales_agent_guid",
  );

  if (!(await indexExists(pool, "tro_document_details", "idx_tro_details_1c_sales_agent"))) {
    await pool.query(
      `ALTER TABLE tro_document_details
       ADD KEY idx_tro_details_1c_sales_agent (one_c_sales_agent_id)`,
    );
  }
  if (!(await constraintExists(pool, "fk_tro_details_1c_sales_agent"))) {
    await pool.query(
      `ALTER TABLE tro_document_details
       ADD CONSTRAINT fk_tro_details_1c_sales_agent
       FOREIGN KEY (one_c_sales_agent_id) REFERENCES sales_agents(id) ON DELETE SET NULL`,
    );
  }

  // Stage-1 integration stored the 1C sales-agent snapshot in executor_name.
  // Preserve that value as the sales-agent snapshot and leave the responsible
  // empty until 1C repeats POST /created with the expanded metadata contract.
  await pool.query(
    `UPDATE tro_document_details
     SET one_c_sales_agent_name = COALESCE(NULLIF(one_c_sales_agent_name, ''), executor_name),
         executor_name = NULL
     WHERE document_1c_guid IS NOT NULL
       AND executor_guid IS NULL
       AND executor_name IS NOT NULL`,
  );
}

export async function down(pool) {
  if (
    await columnExists(pool, "tro_document_details", "one_c_sales_agent_name")
    && await columnExists(pool, "tro_document_details", "executor_name")
  ) {
    await pool.query(
      `UPDATE tro_document_details
       SET executor_name = COALESCE(one_c_sales_agent_name, executor_name)
       WHERE document_1c_guid IS NOT NULL`,
    );
  }

  if (await constraintExists(pool, "fk_tro_details_1c_sales_agent")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP FOREIGN KEY fk_tro_details_1c_sales_agent",
    );
  }
  if (await indexExists(pool, "tro_document_details", "idx_tro_details_1c_sales_agent")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP INDEX idx_tro_details_1c_sales_agent",
    );
  }
  if (await columnExists(pool, "tro_document_details", "one_c_sales_agent_name")) {
    await pool.query(
      "ALTER TABLE tro_document_details DROP COLUMN one_c_sales_agent_name",
    );
  }

  if (
    await columnExists(pool, "tro_document_details", "one_c_sales_agent_guid")
    && !(await columnExists(pool, "tro_document_details", "executor_agent_guid"))
  ) {
    await pool.query(
      `ALTER TABLE tro_document_details
       CHANGE COLUMN one_c_sales_agent_guid executor_agent_guid VARCHAR(36) NULL`,
    );
  }
  if (
    await columnExists(pool, "tro_document_details", "one_c_sales_agent_id")
    && !(await columnExists(pool, "tro_document_details", "executor_sales_agent_id"))
  ) {
    await pool.query(
      `ALTER TABLE tro_document_details
       CHANGE COLUMN one_c_sales_agent_id executor_sales_agent_id INT NULL`,
    );
  }
  if (await columnExists(pool, "tro_document_details", "executor_guid")) {
    await pool.query("ALTER TABLE tro_document_details DROP COLUMN executor_guid");
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
