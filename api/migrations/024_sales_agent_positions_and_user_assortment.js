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

async function addColumn(pool, tableName, columnName, definition) {
  if (!(await columnExists(pool, tableName, columnName))) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

export async function up(pool) {
  await addColumn(
    pool,
    "users",
    "assortment_guid",
    "assortment_guid VARCHAR(36) NULL AFTER user_guid",
  );
  await addColumn(
    pool,
    "users",
    "assortment_name",
    "assortment_name VARCHAR(150) NULL AFTER assortment_guid",
  );

  await addColumn(
    pool,
    "sales_agents",
    "route_name",
    "route_name VARCHAR(255) NULL AFTER route_guid",
  );
  await addColumn(
    pool,
    "sales_agents",
    "assortment_guid",
    "assortment_guid VARCHAR(36) NULL AFTER current_agent_guid",
  );
  await addColumn(
    pool,
    "sales_agents",
    "assortment_name",
    "assortment_name VARCHAR(150) NULL AFTER assortment_guid",
  );
  await addColumn(
    pool,
    "sales_agents",
    "last_seen_at",
    "last_seen_at DATETIME NULL AFTER branch_id",
  );
  await addColumn(
    pool,
    "sales_agents",
    "is_active_1c",
    "is_active_1c TINYINT(1) NOT NULL DEFAULT 1 AFTER last_seen_at",
  );

  await pool.query(
    "ALTER TABLE sales_agents MODIFY COLUMN user_id INT NULL",
  );

  if (await indexExists(pool, "sales_agents", "login")) {
    await pool.query("ALTER TABLE sales_agents DROP INDEX login");
  }
  if (!(await indexExists(pool, "sales_agents", "uq_sales_agents_branch_login"))) {
    await pool.query(
      "ALTER TABLE sales_agents ADD UNIQUE KEY uq_sales_agents_branch_login (branch_id, login)",
    );
  }
}

export async function down(pool) {
  if (await indexExists(pool, "sales_agents", "uq_sales_agents_branch_login")) {
    await pool.query(
      "ALTER TABLE sales_agents DROP INDEX uq_sales_agents_branch_login",
    );
  }
  if (!(await indexExists(pool, "sales_agents", "login"))) {
    await pool.query("ALTER TABLE sales_agents ADD UNIQUE KEY login (login)");
  }

  await pool.query(
    "ALTER TABLE sales_agents MODIFY COLUMN user_id INT NOT NULL",
  );

  for (const column of ["is_active_1c", "last_seen_at", "assortment_name", "assortment_guid", "route_name"]) {
    if (await columnExists(pool, "sales_agents", column)) {
      await pool.query(`ALTER TABLE sales_agents DROP COLUMN ${column}`);
    }
  }
  for (const column of ["assortment_name", "assortment_guid"]) {
    if (await columnExists(pool, "users", column)) {
      await pool.query(`ALTER TABLE users DROP COLUMN ${column}`);
    }
  }
}
