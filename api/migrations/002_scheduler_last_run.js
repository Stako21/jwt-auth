async function getExistingColumns(pool, tableName) {
  const [rows] = await pool.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    `,
    [tableName],
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function addColumnIfMissing(pool, tableName, columnName, definition) {
  const existingColumns = await getExistingColumns(pool, tableName);
  if (existingColumns.has(columnName)) {
    return;
  }

  await pool.query(`
    ALTER TABLE ${tableName}
    ADD COLUMN ${columnName} ${definition}
  `);
}

export async function up(pool) {
  await addColumnIfMissing(
    pool,
    "scheduler_tasks",
    "last_run_status",
    "VARCHAR(64) NULL AFTER is_active",
  );
  await addColumnIfMissing(
    pool,
    "scheduler_tasks",
    "last_run_code",
    "VARCHAR(128) NULL AFTER last_run_status",
  );
  await addColumnIfMissing(
    pool,
    "scheduler_tasks",
    "last_run_message",
    "TEXT NULL AFTER last_run_code",
  );
  await addColumnIfMissing(
    pool,
    "scheduler_tasks",
    "last_run_details",
    "TEXT NULL AFTER last_run_message",
  );
  await addColumnIfMissing(
    pool,
    "scheduler_tasks",
    "last_run_finished_at",
    "DATETIME NULL AFTER last_run_details",
  );
  await addColumnIfMissing(
    pool,
    "scheduler_tasks",
    "last_run_trigger",
    "VARCHAR(32) NULL AFTER last_run_finished_at",
  );
}
