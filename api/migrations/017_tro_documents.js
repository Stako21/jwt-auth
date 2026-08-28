async function columnExists(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tro_products (
      id BIGINT NOT NULL AUTO_INCREMENT,
      branch_id INT NOT NULL,
      source_key CHAR(64) NOT NULL,
      id_1c VARCHAR(64) NULL,
      name VARCHAR(255) NOT NULL,
      group_id_1c VARCHAR(64) NULL,
      group_name VARCHAR(255) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_tro_products_branch_source (branch_id, source_key),
      KEY idx_tro_products_branch_active_name (branch_id, is_active, name),
      CONSTRAINT fk_tro_products_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tro_document_sequences (
      branch_id INT NOT NULL,
      city_id INT NOT NULL,
      last_number INT NOT NULL DEFAULT 0,
      PRIMARY KEY (branch_id, city_id),
      CONSTRAINT fk_tro_sequences_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
      CONSTRAINT fk_tro_sequences_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tro_document_details (
      document_id INT NOT NULL,
      ta_user_id INT NOT NULL,
      movement_type VARCHAR(16) NOT NULL,
      up_document_number VARCHAR(20) NULL,
      executor_name VARCHAR(150) NULL,
      accountant_user_id INT NULL,
      app_install TINYINT(1) NOT NULL DEFAULT 0,
      photo_install TINYINT(1) NOT NULL DEFAULT 0,
      app_return TINYINT(1) NOT NULL DEFAULT 0,
      warehouse_spec_return TINYINT(1) NOT NULL DEFAULT 0,
      completed_by_user_id INT NULL,
      completed_at DATETIME NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (document_id),
      KEY idx_tro_details_ta (ta_user_id),
      CONSTRAINT fk_tro_details_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      CONSTRAINT fk_tro_details_ta FOREIGN KEY (ta_user_id) REFERENCES users(id),
      CONSTRAINT fk_tro_details_accountant FOREIGN KEY (accountant_user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_tro_details_completed_by FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tro_document_items (
      id BIGINT NOT NULL AUTO_INCREMENT,
      document_id INT NOT NULL,
      tro_product_id BIGINT NOT NULL,
      product_name_snapshot VARCHAR(255) NOT NULL,
      quantity DECIMAL(12,3) NOT NULL,
      PRIMARY KEY (id),
      KEY idx_tro_items_document (document_id),
      CONSTRAINT fk_tro_items_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      CONSTRAINT fk_tro_items_product FOREIGN KEY (tro_product_id) REFERENCES tro_products(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  if (await columnExists(pool, "documents", "status")) {
    await pool.query(
      "ALTER TABLE documents MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'NEW'",
    );
  }
  if (await columnExists(pool, "documents", "document_type")) {
    await pool.query("ALTER TABLE documents MODIFY COLUMN document_type VARCHAR(32) NOT NULL");
  }
  if (await columnExists(pool, "document_history", "action")) {
    await pool.query("ALTER TABLE document_history MODIFY COLUMN action VARCHAR(32) NOT NULL");
  }
  if (!(await columnExists(pool, "notification_log", "event_type"))) {
    await pool.query(
      "ALTER TABLE notification_log ADD COLUMN event_type VARCHAR(32) NOT NULL DEFAULT 'SIGNED_PDF' AFTER channel",
    );
  }
  if (!(await columnExists(pool, "notification_log", "event_payload"))) {
    await pool.query(
      "ALTER TABLE notification_log ADD COLUMN event_payload TEXT NULL AFTER event_type",
    );
  }

  await pool.query(`
    INSERT INTO import_sources
      (source_key, file_name, delete_after_success, is_active)
    VALUES ('loadTroProducts', 'Product_TRO.json', 0, 1)
    ON DUPLICATE KEY UPDATE
      file_name = VALUES(file_name),
      delete_after_success = VALUES(delete_after_success),
      is_active = VALUES(is_active)
  `);

  await pool.query(`
    INSERT INTO scheduler_tasks (task_key, label, interval_ms, is_active)
    VALUES ('loadTroProducts', 'Load TRO products', 7200000, 1)
    ON DUPLICATE KEY UPDATE label = VALUES(label)
  `);
}
