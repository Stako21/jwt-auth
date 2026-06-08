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
    "report_definitions",
    "retention_days",
    "retention_days INT NULL AFTER data_start_row",
  );

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS xlsx_1c_sales_report_values (
      id BIGINT NOT NULL AUTO_INCREMENT,
      branch_id INT NOT NULL,
      report_key VARCHAR(128) NOT NULL,
      report_date DATE NOT NULL,
      user_id INT NULL,
      agent_guid VARCHAR(36) NULL,
      agent_name VARCHAR(255) NOT NULL,
      source_row_number INT NOT NULL,
      metric_order INT NOT NULL DEFAULT 0,
      metric_key VARCHAR(191) NOT NULL,
      metric_label VARCHAR(255) NOT NULL,
      metric_value DECIMAL(18, 4) NOT NULL DEFAULT 0,
      source_file_name VARCHAR(255) NULL,
      source_file_mtime DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_xlsx_1c_sales_branch_report_date (branch_id, report_key, report_date),
      KEY idx_xlsx_1c_sales_user (user_id),
      KEY idx_xlsx_1c_sales_agent_guid (agent_guid),
      KEY idx_xlsx_1c_sales_metric (metric_key),
      CONSTRAINT fk_xlsx_1c_sales_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_xlsx_1c_sales_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

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

  await pool.query(`
    INSERT INTO report_definitions (
      branch_id,
      report_key,
      route,
      menu_title,
      file_name,
      report_type,
      sheet_name,
      header_row,
      data_start_row,
      retention_days,
      allowed_roles,
      is_active,
      sort_order
    )
    SELECT
      b.id,
      seed.report_key,
      seed.route,
      seed.menu_title,
      seed.file_name,
      'xlsx-1c-sales',
      'TDSheet',
      12,
      15,
      31,
      NULL,
      1,
      seed.sort_order
    FROM branches b
    JOIN (
      SELECT
        'report-montblanc-sales' AS report_key,
        '/reports/montblanc-sales' AS route,
        'Montblanc' AS menu_title,
        'montblanc2026.xlsx' AS file_name,
        260 AS sort_order
      UNION ALL
      SELECT
        'report-lacmi-sales',
        '/reports/lacmi-sales',
        'Lacmi',
        'lacmi2026.xlsx',
        270
    ) seed
    LEFT JOIN report_definitions existing
      ON existing.branch_id = b.id
      AND existing.report_key = seed.report_key
    WHERE existing.id IS NULL
  `);

  await pool.query(`
    UPDATE report_definitions
    SET report_type = 'xlsx-1c-sales',
        sheet_name = COALESCE(sheet_name, 'TDSheet'),
        header_row = COALESCE(header_row, 12),
        data_start_row = COALESCE(data_start_row, 15),
        retention_days = COALESCE(retention_days, 31)
    WHERE report_key IN ('report-montblanc-sales', 'report-lacmi-sales')
  `);
}
