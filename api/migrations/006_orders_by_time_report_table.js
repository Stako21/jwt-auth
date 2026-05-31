export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders_by_time_report_rows (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      order_date DATE NOT NULL,
      order_datetime DATETIME NOT NULL,
      order_number VARCHAR(128) NOT NULL DEFAULT '',
      sales_agent VARCHAR(255) NULL,
      supervisor VARCHAR(255) NULL,
      city VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_orders_by_time_branch_date (branch_id, order_date),
      KEY idx_orders_by_time_order_datetime (order_datetime),
      CONSTRAINT fk_orders_by_time_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
