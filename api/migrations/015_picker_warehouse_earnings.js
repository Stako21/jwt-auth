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
    "user_guid",
    "user_guid VARCHAR(36) NULL AFTER current_agent_guid",
  );
  await addIndexIfMissing(
    pool,
    "users",
    "uq_users_branch_user_guid",
    "UNIQUE INDEX uq_users_branch_user_guid (branch_id, user_guid)",
  );

  await addColumnIfMissing(
    pool,
    "bill_of_lading_report_rows",
    "warehouse_guid",
    "warehouse_guid VARCHAR(36) NULL AFTER warehouse_name",
  );
  await addColumnIfMissing(
    pool,
    "bill_of_lading_report_rows",
    "picker_guid",
    "picker_guid VARCHAR(36) NULL AFTER picker",
  );
  await addIndexIfMissing(
    pool,
    "bill_of_lading_report_rows",
    "idx_bill_lading_branch_picker_date",
    "INDEX idx_bill_lading_branch_picker_date (branch_id, picker_guid, report_date)",
  );
  await addIndexIfMissing(
    pool,
    "bill_of_lading_report_rows",
    "idx_bill_lading_branch_warehouse_date",
    "INDEX idx_bill_lading_branch_warehouse_date (branch_id, warehouse_guid, report_date)",
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id INT NOT NULL AUTO_INCREMENT,
      branch_id INT NOT NULL,
      warehouse_guid VARCHAR(36) NOT NULL,
      warehouse_name VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_warehouses_branch_guid (branch_id, warehouse_guid),
      KEY idx_warehouses_branch_active (branch_id, is_active),
      CONSTRAINT fk_warehouses_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouse_rate_history (
      id BIGINT NOT NULL AUTO_INCREMENT,
      branch_id INT NOT NULL,
      warehouse_id INT NOT NULL,
      effective_from DATE NOT NULL,
      row_rate DECIMAL(14, 4) NOT NULL DEFAULT 0,
      kilogram_rate DECIMAL(14, 4) NOT NULL DEFAULT 0,
      created_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_warehouse_rate_date (warehouse_id, effective_from),
      KEY idx_warehouse_rates_branch_date (branch_id, effective_from),
      CONSTRAINT fk_warehouse_rates_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_warehouse_rates_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_warehouse_rates_user
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouse_rate_audit (
      id BIGINT NOT NULL AUTO_INCREMENT,
      branch_id INT NOT NULL,
      warehouse_id INT NOT NULL,
      effective_from DATE NOT NULL,
      old_row_rate DECIMAL(14, 4) NULL,
      new_row_rate DECIMAL(14, 4) NOT NULL,
      old_kilogram_rate DECIMAL(14, 4) NULL,
      new_kilogram_rate DECIMAL(14, 4) NOT NULL,
      affected_rows_count INT NOT NULL DEFAULT 0,
      affected_date_from DATE NULL,
      affected_date_to DATE NULL,
      changed_by INT NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_warehouse_rate_audit_branch_warehouse (branch_id, warehouse_id, changed_at),
      CONSTRAINT fk_warehouse_rate_audit_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_warehouse_rate_audit_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_warehouse_rate_audit_user
        FOREIGN KEY (changed_by) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    UPDATE report_definitions
    SET retention_days = GREATEST(COALESCE(retention_days, 365), 180)
    WHERE report_key = 'report-bill-of-lading'
  `);

  const [branches] = await pool.query("SELECT id FROM branches");
  for (const branch of branches) {
    await pool.query(
      `
      INSERT INTO report_definitions (
        branch_id,
        report_key,
        route,
        menu_title,
        file_name,
        allowed_roles,
        is_active,
        sort_order,
        retention_days
      )
      SELECT ?, 'report-picker-earnings', '/picker-earnings',
        'Заробіток комплектувальників', 'BillOfLading.json', '[2]', 1, 60, 365
      WHERE NOT EXISTS (
        SELECT 1
        FROM report_definitions
        WHERE branch_id = ?
          AND report_key = 'report-picker-earnings'
      )
      `,
      [branch.id, branch.id],
    );
  }
}
