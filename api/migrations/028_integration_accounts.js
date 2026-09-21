async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function indexExists(pool, table, index) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_accounts (
      id INT NOT NULL AUTO_INCREMENT,
      login VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(150) NOT NULL,
      issued_to_name VARCHAR(150) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      can_process_requests TINYINT(1) NOT NULL DEFAULT 1,
      can_sync_statuses TINYINT(1) NOT NULL DEFAULT 0,
      last_login_at DATETIME NULL,
      last_used_at DATETIME NULL,
      created_by_user_id INT NOT NULL,
      updated_by_user_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_integration_accounts_login (login),
      KEY idx_integration_accounts_active (is_active),
      CONSTRAINT fk_integration_accounts_created_by FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_integration_accounts_updated_by FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS integration_account_cities (
      integration_account_id INT NOT NULL,
      city_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (integration_account_id, city_id),
      KEY idx_integration_account_cities_city (city_id),
      CONSTRAINT fk_integration_account_cities_account FOREIGN KEY (integration_account_id)
        REFERENCES integration_accounts(id) ON DELETE CASCADE,
      CONSTRAINT fk_integration_account_cities_city FOREIGN KEY (city_id)
        REFERENCES cities(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  if (await columnExists(pool, "document_history", "user_id")) {
    await pool.query("ALTER TABLE document_history MODIFY COLUMN user_id INT NULL");
  }

  if (!(await indexExists(pool, "documents", "idx_documents_tro_integration_queue"))) {
    await pool.query(`ALTER TABLE documents
      ADD KEY idx_documents_tro_integration_queue
      (branch_id, city, document_type, status, created_at, id)`);
  }
}

export async function down(pool) {
  if (await indexExists(pool, "documents", "idx_documents_tro_integration_queue")) {
    await pool.query("ALTER TABLE documents DROP INDEX idx_documents_tro_integration_queue");
  }
  if (await columnExists(pool, "document_history", "user_id")) {
    await pool.query("ALTER TABLE document_history MODIFY COLUMN user_id INT NOT NULL");
  }
  await pool.query("DROP TABLE IF EXISTS integration_account_cities");
  await pool.query("DROP TABLE IF EXISTS integration_accounts");
}
