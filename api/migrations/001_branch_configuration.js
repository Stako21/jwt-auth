import {
  defaultBootstrapBranchConfig,
  DEFAULT_BRANCH_ID,
} from "../config/bootstrapBranchConfig.js";

async function tableExists(pool, tableName) {
  const [rows] = await pool.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = ?
    LIMIT 1
    `,
    [tableName],
  );

  return rows.length > 0;
}

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

async function addColumnIfMissing(pool, tableName, columnDefinition) {
  const columnName = columnDefinition.trim().split(/\s+/)[0].replace(/`/g, "");

  if (!(await tableExists(pool, tableName))) return;
  if (await columnExists(pool, tableName, columnName)) return;

  await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinition}`);
}

async function addIndexIfMissing(pool, tableName, indexName, indexDefinition) {
  if (!(await tableExists(pool, tableName))) return;
  if (await indexExists(pool, tableName, indexName)) return;

  await pool.query(`ALTER TABLE \`${tableName}\` ADD ${indexDefinition}`);
}

async function backfillBranch(pool, tableName) {
  if (!(await tableExists(pool, tableName))) return;
  if (!(await columnExists(pool, tableName, "branch_id"))) return;

  await pool.query(
    `UPDATE \`${tableName}\` SET branch_id = ? WHERE branch_id IS NULL`,
    [DEFAULT_BRANCH_ID],
  );
}

async function seedBootstrapBranchConfig(pool) {
  const branch = defaultBootstrapBranchConfig.branch;

  await pool.query(
    `
    INSERT INTO branches (id, slug, name, short_name, is_active)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      slug = VALUES(slug),
      name = VALUES(name),
      short_name = VALUES(short_name),
      is_active = VALUES(is_active)
    `,
    [
      Number(branch.id),
      branch.slug,
      branch.name,
      branch.shortName,
      branch.isActive ? 1 : 0,
    ],
  );

  for (const city of defaultBootstrapBranchConfig.cities) {
    await pool.query(
      `
      INSERT INTO cities
        (id, branch_id, slug, name, short_name, document_prefix, is_active, sort_order)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        branch_id = VALUES(branch_id),
        slug = VALUES(slug),
        name = VALUES(name),
        short_name = VALUES(short_name),
        document_prefix = VALUES(document_prefix),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)
      `,
      [
        Number(city.id),
        Number(branch.id),
        city.slug,
        city.name,
        city.shortName,
        city.documentPrefix,
        city.isActive ? 1 : 0,
        Number(city.sortOrder),
      ],
    );
  }

  const [cityRows] = await pool.query(
    `
    SELECT id, slug
    FROM cities
    WHERE branch_id = ?
    `,
    [Number(branch.id)],
  );
  const cityIdsBySlug = new Map(
    cityRows.map((row) => [String(row.slug), Number(row.id)]),
  );

  for (const page of defaultBootstrapBranchConfig.balancePages) {
    await pool.query(
      `
      INSERT INTO balance_pages
        (branch_id, city_id, slug, menu_title, header_title, file_name, is_active, sort_order)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        city_id = VALUES(city_id),
        menu_title = VALUES(menu_title),
        header_title = VALUES(header_title),
        file_name = VALUES(file_name),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)
      `,
      [
        Number(branch.id),
        page.citySlug ? cityIdsBySlug.get(page.citySlug) || null : null,
        page.slug,
        page.menuTitle,
        page.headerTitle,
        page.fileName,
        page.isActive ? 1 : 0,
        Number(page.sortOrder),
      ],
    );
  }

  for (const report of defaultBootstrapBranchConfig.reports) {
    await pool.query(
      `
      INSERT INTO report_definitions
        (branch_id, report_key, route, menu_title, file_name, allowed_roles, is_active, sort_order)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        route = VALUES(route),
        menu_title = VALUES(menu_title),
        file_name = VALUES(file_name),
        allowed_roles = VALUES(allowed_roles),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)
      `,
      [
        Number(branch.id),
        report.reportKey,
        report.route,
        report.menuTitle,
        report.fileName,
        Array.isArray(report.allowedRoles)
          ? JSON.stringify(report.allowedRoles)
          : null,
        report.isActive ? 1 : 0,
        Number(report.sortOrder),
      ],
    );
  }
}

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      short_name VARCHAR(64) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_branches_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      slug VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      short_name VARCHAR(64) NOT NULL,
      document_prefix VARCHAR(32) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cities_branch_slug (branch_id, slug),
      UNIQUE KEY uq_cities_branch_document_prefix (branch_id, document_prefix),
      CONSTRAINT fk_cities_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_pages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      city_id INT NULL,
      slug VARCHAR(64) NOT NULL,
      menu_title VARCHAR(64) NOT NULL,
      header_title VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_balance_pages_branch_slug (branch_id, slug),
      UNIQUE KEY uq_balance_pages_branch_file_name (branch_id, file_name),
      KEY idx_balance_pages_city_id (city_id),
      CONSTRAINT fk_balance_pages_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE RESTRICT,
      CONSTRAINT fk_balance_pages_city
        FOREIGN KEY (city_id) REFERENCES cities(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_definitions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      report_key VARCHAR(128) NOT NULL,
      route VARCHAR(128) NOT NULL,
      menu_title VARCHAR(128) NOT NULL,
      file_name VARCHAR(255) NULL,
      allowed_roles TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_report_definitions_branch_key (branch_id, report_key),
      UNIQUE KEY uq_report_definitions_branch_route (branch_id, route),
      CONSTRAINT fk_report_definitions_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_sources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      source_key VARCHAR(128) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      delete_after_success TINYINT(1) NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_import_sources_key (source_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduler_tasks (
      task_key VARCHAR(128) PRIMARY KEY,
      label VARCHAR(255) NOT NULL,
      interval_ms INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_branch_access (
      user_id INT NOT NULL,
      branch_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, branch_id),
      CONSTRAINT fk_user_branch_access_branch
        FOREIGN KEY (branch_id) REFERENCES branches(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_city_access (
      user_id INT NOT NULL,
      city_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, city_id),
      CONSTRAINT fk_user_city_access_city
        FOREIGN KEY (city_id) REFERENCES cities(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await seedBootstrapBranchConfig(pool);

  await pool.query(`
    INSERT INTO import_sources
      (source_key, file_name, delete_after_success, is_active)
    VALUES
      ('loadSalesAgents', 'SalesAgent.json', 1, 1),
      ('loadSalesReports', 'SalesReport.json', 1, 1),
      ('loadProducts', 'Product.json', 1, 1),
      ('loadTradePoints', 'TradePoint.json', 1, 1),
      ('loadOrdersByTimeReport', 'OrderByTimet.json', 0, 1),
      ('loadBillOfLadingReport', 'BillOfLading.json', 0, 1),
      ('reportRomashka', 'report_romashka.json', 0, 1)
    ON DUPLICATE KEY UPDATE
      file_name = VALUES(file_name),
      delete_after_success = VALUES(delete_after_success),
      is_active = VALUES(is_active)
  `);

  await pool.query(`
    INSERT INTO scheduler_tasks
      (task_key, label, interval_ms, is_active)
    VALUES
      ('loadSalesAgents', 'Load sales agents', 7200000, 1),
      ('loadSalesReports', 'Load sales reports', 30000, 1),
      ('loadOrdersByTimeReport', 'Load orders by time report', 300000, 1),
      ('loadBillOfLadingReport', 'Load bill of lading report', 300000, 1),
      ('loadProducts', 'Load products', 7200000, 1),
      ('loadTradePoints', 'Load trade points', 7200000, 1),
      ('retryFailedNotifications', 'Retry failed notifications', 300000, 1)
    ON DUPLICATE KEY UPDATE
      label = VALUES(label)
  `);

  const branchScopedTables = [
    "users",
    "sales_agents",
    "sales_reports",
    "report_imports",
    "product_groups",
    "products",
    "contractors",
    "trade_points",
    "documents",
    "document_sequences",
    "region_notifications",
  ];

  for (const tableName of branchScopedTables) {
    await addColumnIfMissing(pool, tableName, "branch_id INT NULL DEFAULT 1");
    await backfillBranch(pool, tableName);
    await addIndexIfMissing(
      pool,
      tableName,
      `idx_${tableName}_branch_id`,
      `INDEX idx_${tableName}_branch_id (branch_id)`,
    );
  }
}
