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

async function addColumnIfMissing(pool, tableName, columnName, definition) {
  if (await columnExists(pool, tableName, columnName)) return;
  await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

async function addIndexIfMissing(pool, tableName, indexName, definition) {
  if (await indexExists(pool, tableName, indexName)) return;
  await pool.query(`ALTER TABLE ${tableName} ADD ${definition}`);
}

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "users",
    "current_agent_guid",
    "current_agent_guid VARCHAR(36) NULL AFTER user_name",
  );

  await addColumnIfMissing(
    pool,
    "sales_agents",
    "route_guid",
    "route_guid VARCHAR(36) NULL AFTER login",
  );
  await addColumnIfMissing(
    pool,
    "sales_agents",
    "current_agent_guid",
    "current_agent_guid VARCHAR(36) NULL AFTER full_name",
  );
  await addColumnIfMissing(
    pool,
    "sales_agents",
    "supervisor_guid",
    "supervisor_guid VARCHAR(36) NULL AFTER supervisor_name",
  );
  await addColumnIfMissing(
    pool,
    "sales_agents",
    "regional_division_guid",
    "regional_division_guid VARCHAR(36) NULL AFTER city",
  );

  await addIndexIfMissing(
    pool,
    "users",
    "idx_users_current_agent_guid",
    "INDEX idx_users_current_agent_guid (current_agent_guid)",
  );
  await addIndexIfMissing(
    pool,
    "sales_agents",
    "idx_sales_agents_current_agent_guid",
    "INDEX idx_sales_agents_current_agent_guid (branch_id, current_agent_guid)",
  );

  await addColumnIfMissing(
    pool,
    "xlsx_1c_sales_report_values",
    "agent_guid",
    "agent_guid VARCHAR(36) NULL AFTER user_id",
  );
  await addIndexIfMissing(
    pool,
    "xlsx_1c_sales_report_values",
    "idx_xlsx_1c_sales_agent_guid",
    "INDEX idx_xlsx_1c_sales_agent_guid (agent_guid)",
  );
}
