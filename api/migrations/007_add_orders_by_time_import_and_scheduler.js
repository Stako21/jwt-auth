export async function up(pool) {
  await pool.query(`
    INSERT INTO import_sources
      (source_key, file_name, delete_after_success, is_active)
    VALUES
      ('loadOrdersByTimeReport', 'OrderByTimet.json', 0, 1)
    ON DUPLICATE KEY UPDATE
      file_name = VALUES(file_name),
      delete_after_success = VALUES(delete_after_success),
      is_active = VALUES(is_active)
  `);

  await pool.query(`
    INSERT INTO scheduler_tasks
      (task_key, label, interval_ms, is_active)
    VALUES
      ('loadOrdersByTimeReport', 'Load orders by time report', 300000, 1)
    ON DUPLICATE KEY UPDATE
      label = VALUES(label)
  `);
}
