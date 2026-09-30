async function tableExists(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

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

async function getIndex(pool, tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?
     ORDER BY SEQ_IN_INDEX`,
    [tableName, indexName],
  );
  if (!rows.length) return null;
  return {
    unique: Number(rows[0].NON_UNIQUE) === 0,
    columns: rows.map((row) => row.COLUMN_NAME),
  };
}

function hasExactColumns(index, expectedColumns) {
  return Boolean(
    index &&
      index.columns.length === expectedColumns.length &&
      index.columns.every((column, indexPosition) => (
        column === expectedColumns[indexPosition]
      )),
  );
}

export async function up(pool) {
  if (!(await tableExists(pool, "sales_reports"))) return;

  const canonicalIndex = await getIndex(
    pool,
    "sales_reports",
    "uq_sales_reports_active_document_guid",
  );
  if (!hasExactColumns(canonicalIndex, ["branch_id", "active_document_guid"])) {
    throw new Error(
      "Canonical active Sales Report GUID index is missing or has an unexpected shape",
    );
  }

  const legacyIndex = await getIndex(pool, "sales_reports", "uk_active_doc");
  if (legacyIndex) {
    if (
      !legacyIndex.unique ||
      !hasExactColumns(legacyIndex, [
        "document_number",
        "login_agent",
        "active_flag",
      ])
    ) {
      throw new Error("Legacy Sales Report index uk_active_doc has an unexpected shape");
    }
    await pool.query("ALTER TABLE sales_reports DROP INDEX uk_active_doc");
  }

  if (!(await getIndex(pool, "sales_reports", "idx_sales_reports_branch_number_status"))) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD INDEX idx_sales_reports_branch_number_status
        (branch_id, document_number, status)
    `);
  }
}

export async function down(pool) {
  if (!(await tableExists(pool, "sales_reports"))) return;

  if (await getIndex(pool, "sales_reports", "idx_sales_reports_branch_number_status")) {
    await pool.query(`
      ALTER TABLE sales_reports
      DROP INDEX idx_sales_reports_branch_number_status
    `);
  }

  if (
    !(await getIndex(pool, "sales_reports", "uk_active_doc")) &&
    (await columnExists(pool, "sales_reports", "active_flag"))
  ) {
    await pool.query(`
      ALTER TABLE sales_reports
      ADD UNIQUE INDEX uk_active_doc
        (document_number, login_agent, active_flag)
    `);
  }
}
