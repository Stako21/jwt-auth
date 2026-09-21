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

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_warehouse_access (
      user_id INT NOT NULL,
      warehouse_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, warehouse_id),
      KEY idx_user_warehouse_access_warehouse (warehouse_id, user_id),
      CONSTRAINT fk_user_warehouse_access_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_user_warehouse_access_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export async function down(pool) {
  if (await tableExists(pool, "user_warehouse_access")) {
    await pool.query("DROP TABLE user_warehouse_access");
  }
}
