async function tableExists(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

export async function up(pool) {
  if (!(await columnExists(pool, "users", "multi_assortment_allowed"))) {
    await pool.query(
      `ALTER TABLE users
       ADD COLUMN multi_assortment_allowed TINYINT(1) NOT NULL DEFAULT 0
       AFTER assortment_name`,
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_assortments (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      assortment_guid VARCHAR(36) NOT NULL,
      assortment_name VARCHAR(150) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_assortments_user_guid (user_id, assortment_guid),
      KEY idx_user_assortments_guid (assortment_guid),
      CONSTRAINT fk_user_assortments_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Preserve any values entered while migration 024 was active. Do not infer
  // or assign values for users whose deprecated columns are still NULL.
  await pool.query(`
    INSERT INTO user_assortments (user_id, assortment_guid, assortment_name)
    SELECT id, LOWER(TRIM(assortment_guid)), assortment_name
    FROM users
    WHERE assortment_guid IS NOT NULL AND TRIM(assortment_guid) <> ''
    ON DUPLICATE KEY UPDATE
      assortment_name = COALESCE(
        VALUES(assortment_name),
        user_assortments.assortment_name
      )
  `);
}

export async function down(pool) {
  if (await tableExists(pool, "user_assortments")) {
    await pool.query("DROP TABLE user_assortments");
  }
  if (await columnExists(pool, "users", "multi_assortment_allowed")) {
    await pool.query(
      "ALTER TABLE users DROP COLUMN multi_assortment_allowed",
    );
  }
}
