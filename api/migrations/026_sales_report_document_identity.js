async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function indexExists(pool, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?
     LIMIT 1`,
    [tableName, indexName],
  );
  return rows.length > 0;
}

export async function up(pool) {
  if (!(await columnExists(pool, "sales_reports", "document_guid"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD COLUMN document_guid VARCHAR(36) NULL AFTER document_number
    `);
  }

  if (!(await columnExists(pool, "sales_reports", "sales_agent_guid"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD COLUMN sales_agent_guid VARCHAR(36) NULL AFTER sales_agent_name
    `);
  }

  if (!(await indexExists(pool, "sales_reports", "idx_sales_reports_branch_document_guid"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD INDEX idx_sales_reports_branch_document_guid (branch_id, document_guid)
    `);
  }

  if (!(await indexExists(pool, "sales_reports", "idx_sales_reports_branch_sales_agent_guid"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD INDEX idx_sales_reports_branch_sales_agent_guid (branch_id, sales_agent_guid)
    `);
  }

  if (!(await columnExists(pool, "sales_reports", "active_document_guid"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD COLUMN active_document_guid VARCHAR(36)
        GENERATED ALWAYS AS (
          CASE WHEN status = 'ACTIVE' THEN document_guid ELSE NULL END
        ) STORED
        AFTER active_flag
    `);
  }

  if (!(await indexExists(pool, "sales_reports", "uq_sales_reports_active_document_guid"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD UNIQUE INDEX uq_sales_reports_active_document_guid
        (branch_id, active_document_guid)
    `);
  }
}

export async function down(pool) {
  if (await indexExists(pool, "sales_reports", "uq_sales_reports_active_document_guid")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP INDEX uq_sales_reports_active_document_guid
    `);
  }

  if (await columnExists(pool, "sales_reports", "active_document_guid")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP COLUMN active_document_guid
    `);
  }

  if (await indexExists(pool, "sales_reports", "idx_sales_reports_branch_sales_agent_guid")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP INDEX idx_sales_reports_branch_sales_agent_guid
    `);
  }

  if (await indexExists(pool, "sales_reports", "idx_sales_reports_branch_document_guid")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP INDEX idx_sales_reports_branch_document_guid
    `);
  }

  if (await columnExists(pool, "sales_reports", "sales_agent_guid")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP COLUMN sales_agent_guid
    `);
  }

  if (await columnExists(pool, "sales_reports", "document_guid")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP COLUMN document_guid
    `);
  }
}
