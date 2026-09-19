async function columnExists(pool, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'tro_document_details'
       AND column_name = ? LIMIT 1`, [columnName],
  );
  return rows.length > 0;
}

async function indexExists(pool, indexName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'tro_document_details'
       AND index_name = ? LIMIT 1`, [indexName],
  );
  return rows.length > 0;
}

async function constraintExists(pool, constraintName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ? LIMIT 1`, [constraintName],
  );
  return rows.length > 0;
}

async function addColumn(pool, name, definition) {
  if (!(await columnExists(pool, name))) {
    await pool.query(`ALTER TABLE tro_document_details ADD COLUMN ${definition}`);
  }
}

export async function up(pool) {
  await addColumn(pool, "request_sales_agent_id", "request_sales_agent_id INT NULL AFTER ta_user_id");
  await addColumn(pool, "request_agent_login", "request_agent_login VARCHAR(50) NULL AFTER request_sales_agent_id");
  await addColumn(pool, "request_agent_guid", "request_agent_guid VARCHAR(36) NULL AFTER request_agent_login");
  await addColumn(pool, "request_agent_name", "request_agent_name VARCHAR(255) NULL AFTER request_agent_guid");
  await addColumn(pool, "request_route_guid", "request_route_guid VARCHAR(36) NULL AFTER request_agent_name");
  await addColumn(pool, "request_route_name", "request_route_name VARCHAR(255) NULL AFTER request_route_guid");
  await addColumn(pool, "request_assortment_guid", "request_assortment_guid VARCHAR(36) NULL AFTER request_route_name");
  await addColumn(pool, "request_assortment_name", "request_assortment_name VARCHAR(150) NULL AFTER request_assortment_guid");
  if (!(await indexExists(pool, "idx_tro_details_request_sales_agent"))) {
    await pool.query("ALTER TABLE tro_document_details ADD KEY idx_tro_details_request_sales_agent (request_sales_agent_id)");
  }
  if (!(await constraintExists(pool, "fk_tro_details_request_sales_agent"))) {
    await pool.query(`ALTER TABLE tro_document_details
      ADD CONSTRAINT fk_tro_details_request_sales_agent
      FOREIGN KEY (request_sales_agent_id) REFERENCES sales_agents(id)
      ON DELETE SET NULL ON UPDATE CASCADE`);
  }
}

export async function down(pool) {
  if (await constraintExists(pool, "fk_tro_details_request_sales_agent")) {
    await pool.query("ALTER TABLE tro_document_details DROP FOREIGN KEY fk_tro_details_request_sales_agent");
  }
  if (await indexExists(pool, "idx_tro_details_request_sales_agent")) {
    await pool.query("ALTER TABLE tro_document_details DROP INDEX idx_tro_details_request_sales_agent");
  }
  for (const column of ["request_assortment_name", "request_assortment_guid", "request_route_name", "request_route_guid", "request_agent_name", "request_agent_guid", "request_agent_login", "request_sales_agent_id"]) {
    if (await columnExists(pool, column)) await pool.query(`ALTER TABLE tro_document_details DROP COLUMN ${column}`);
  }
}
