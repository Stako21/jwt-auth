import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRootDir = path.join(__dirname, "..");
const migrationsDir = path.join(apiRootDir, "migrations");

dotenv.config({ path: path.join(apiRootDir, ".env") });

const REQUIRED_ENV = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "CLIENT_URL",
];

const RECOMMENDED_ENV = [
  "BRANCH_ID",
  "BRANCH_SLUG",
  "IMPORT_DIR",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "ROCKET_URL",
  "ROCKET_USER_ID",
  "ROCKET_TOKEN",
];

const CORE_TABLES = {
  branches: ["id", "slug", "name", "short_name", "is_active"],
  cities: [
    "id",
    "branch_id",
    "slug",
    "name",
    "short_name",
    "document_prefix",
    "is_active",
  ],
  balance_pages: [
    "id",
    "branch_id",
    "slug",
    "menu_title",
    "header_title",
    "file_name",
    "price_multiplier_percent",
  ],
  report_definitions: [
    "id",
    "branch_id",
    "report_key",
    "route",
    "menu_title",
    "allowed_roles",
  ],
  import_sources: ["id", "source_key", "file_name", "is_active"],
  orders_by_time_report_rows: [
    "id",
    "branch_id",
    "order_date",
    "order_datetime",
    "order_number",
  ],
  bill_of_lading_report_rows: [
    "id",
    "branch_id",
    "report_date",
    "warehouse_name",
    "picker",
    "scan_datetime",
  ],
  scheduler_tasks: ["id", "task_key", "is_active", "interval_ms"],
  schema_migrations: ["name", "executed_at"],
};

const LEGACY_TABLES = {
  users: ["id", "name", "password", "role"],
  refresh_sessions: ["id", "user_id", "refresh_token", "finger_print"],
  user_hierarchy: ["parent_user_id", "child_user_id"],
  sales_reports: ["id", "report_date", "document_number", "login_agent", "branch_id"],
  report_imports: ["id", "report_date", "imported_at", "branch_id"],
  sales_agents: ["id", "login", "branch_id"],
  region_notifications: ["id", "city"],
};

function icon(status) {
  if (status === "ok") return "[ok]";
  if (status === "warn") return "[warn]";
  return "[fail]";
}

function logCheck(status, title, details = "") {
  const suffix = details ? ` - ${details}` : "";
  console.log(`${icon(status)} ${title}${suffix}`);
}

function getConnectionConfig({ database } = {}) {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_BOOTSTRAP_USER || process.env.DB_USER,
    password: process.env.DB_BOOTSTRAP_PASSWORD || process.env.DB_PASSWORD,
    charset: process.env.DB_CHARSET || "utf8mb4",
    database,
    namedPlaceholders: true,
  };
}

async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDir);
  return entries.filter((file) => file.endsWith(".js")).sort();
}

async function listExistingTables(connection, dbName) {
  const [rows] = await connection.query(
    `
    SELECT table_name AS tableName
    FROM information_schema.tables
    WHERE table_schema = ?
    ORDER BY table_name
    `,
    [dbName],
  );

  return rows.map((row) => row.tableName);
}

async function getTableColumns(connection, dbName, tableName) {
  const [rows] = await connection.query(
    `
    SELECT column_name AS columnName
    FROM information_schema.columns
    WHERE table_schema = ?
      AND table_name = ?
    ORDER BY ordinal_position
    `,
    [dbName, tableName],
  );

  return rows.map((row) => row.columnName);
}

async function tableShapeCheck(connection, dbName, tableMap, sectionTitle) {
  console.log(`\n${sectionTitle}`);
  const existingTables = await listExistingTables(connection, dbName);

  for (const [tableName, requiredColumns] of Object.entries(tableMap)) {
    if (!existingTables.includes(tableName)) {
      logCheck("fail", `table ${tableName}`, "table is missing");
      continue;
    }

    const columns = await getTableColumns(connection, dbName, tableName);
    const missingColumns = requiredColumns.filter(
      (column) => !columns.includes(column),
    );

    if (missingColumns.length) {
      logCheck(
        "fail",
        `table ${tableName}`,
        `missing columns: ${missingColumns.join(", ")}`,
      );
      continue;
    }

    logCheck("ok", `table ${tableName}`, "shape looks good");
  }
}

async function checkAdminSeedState(connection) {
  console.log("\nAdmin user");

  const [[userCountRow]] = await connection.query(
    `
    SELECT COUNT(*) AS total
    FROM users
    WHERE is_active = 1
      AND role = 1
    `,
  );

  const totalAdmins = Number(userCountRow?.total || 0);
  if (!totalAdmins) {
    logCheck("warn", "active admin users", "no active admins found");
  } else {
    logCheck("ok", "active admin users", `${totalAdmins} found`);
  }

  const [[defaultAdmin]] = await connection.query(
    `
    SELECT id, name
    FROM users
    WHERE name = ?
    LIMIT 1
    `,
    [process.env.BOOTSTRAP_ADMIN_LOGIN || "admin"],
  );

  if (defaultAdmin) {
    logCheck(
      "warn",
      "default bootstrap admin",
      `user \`${defaultAdmin.name}\` exists (change its password if still default)`,
    );
  } else {
    logCheck("ok", "default bootstrap admin", "not present");
  }
}

async function checkBranchRuntimeState(connection) {
  console.log("\nBranch runtime");

  const [[branchStats]] = await connection.query(
    `
    SELECT
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
      COUNT(*) AS totalCount
    FROM branches
    `,
  );

  const activeCount = Number(branchStats?.activeCount || 0);
  const totalCount = Number(branchStats?.totalCount || 0);

  if (!totalCount) {
    logCheck("fail", "branches", "no branches configured");
  } else if (!activeCount) {
    logCheck("fail", "branches", "no active branches configured");
  } else {
    logCheck("ok", "branches", `${activeCount} active / ${totalCount} total`);
  }

  const hasSchedulerBranchSelector = Boolean(
    String(process.env.BRANCH_ID || "").trim() ||
      String(process.env.BRANCH_SLUG || "").trim(),
  );

  if (activeCount > 1 && !hasSchedulerBranchSelector) {
    logCheck(
      "warn",
      "scheduler branch selector",
      "multiple active branches found; set BRANCH_ID or BRANCH_SLUG for background tasks",
    );
  } else if (hasSchedulerBranchSelector) {
    logCheck("ok", "scheduler branch selector", "configured");
  } else {
    logCheck("ok", "scheduler branch selector", "not needed for a single active branch");
  }

  const [[cityStats]] = await connection.query(
    `
    SELECT
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
      COUNT(*) AS totalCount
    FROM cities
    `,
  );

  logCheck(
    Number(cityStats?.activeCount || 0) > 0 ? "ok" : "warn",
    "cities",
    `${Number(cityStats?.activeCount || 0)} active / ${Number(cityStats?.totalCount || 0)} total`,
  );
}

async function checkMigrationState(connection) {
  console.log("\nMigrations");

  const migrationFiles = await getMigrationFiles();
  logCheck(
    migrationFiles.length ? "ok" : "warn",
    "migration files",
    `${migrationFiles.length} file(s) in api/migrations`,
  );

  const tables = await listExistingTables(connection, getDatabaseName());
  if (!tables.includes("schema_migrations")) {
    logCheck("warn", "schema_migrations", "table missing; migrations may not have been run");
    return;
  }

  const [rows] = await connection.query("SELECT name FROM schema_migrations ORDER BY name");
  const applied = new Set(rows.map((row) => row.name));
  const pending = migrationFiles.filter((file) => !applied.has(file));

  if (pending.length) {
    logCheck("warn", "pending migrations", pending.join(", "));
  } else {
    logCheck("ok", "pending migrations", "none");
  }
}

function getDatabaseName() {
  return process.env.DB_NAME || "auth";
}

async function run() {
  console.log("Bootstrap doctor started.\n");

  console.log("Environment");
  const missingRequiredEnv = REQUIRED_ENV.filter(
    (name) => !String(process.env[name] || "").trim(),
  );

  if (missingRequiredEnv.length) {
    logCheck(
      "fail",
      "required env",
      `missing: ${missingRequiredEnv.join(", ")}`,
    );
  } else {
    logCheck("ok", "required env", "all core variables are set");
  }

  const presentRecommendedEnv = RECOMMENDED_ENV.filter((name) =>
    String(process.env[name] || "").trim(),
  );
  logCheck(
    presentRecommendedEnv.length ? "ok" : "warn",
    "recommended env",
    presentRecommendedEnv.length
      ? `present: ${presentRecommendedEnv.join(", ")}`
      : "none of the recommended optional variables are set",
  );

  const dbName = getDatabaseName();
  let serverConnection;

  try {
    serverConnection = await mysql.createConnection(getConnectionConfig());
    logCheck("ok", "mysql server connection", "connected successfully");
  } catch (error) {
    logCheck("fail", "mysql server connection", error.message);
    process.exit(1);
  }

  try {
    const [dbRows] = await serverConnection.query(
      `
      SELECT schema_name AS schemaName
      FROM information_schema.schemata
      WHERE schema_name = ?
      LIMIT 1
      `,
      [dbName],
    );

    if (!dbRows.length) {
      logCheck(
        "warn",
        `database ${dbName}`,
        "database does not exist yet; run npm run bootstrap:env",
      );
      await serverConnection.end();
      process.exit(0);
    }

    logCheck("ok", `database ${dbName}`, "exists");
    await serverConnection.end();
  } catch (error) {
    logCheck("fail", `database ${dbName}`, error.message);
    try {
      await serverConnection.end();
    } catch {}
    process.exit(1);
  }

  let dbConnection;
  try {
    dbConnection = await mysql.createConnection(getConnectionConfig({ database: dbName }));
    logCheck("ok", `database ${dbName} connection`, "connected successfully");

    await checkMigrationState(dbConnection);
    await tableShapeCheck(dbConnection, dbName, CORE_TABLES, "Core branch-config tables");
    await tableShapeCheck(dbConnection, dbName, LEGACY_TABLES, "Legacy runtime tables");

    const existingTables = await listExistingTables(dbConnection, dbName);
    if (existingTables.includes("users")) {
      await checkAdminSeedState(dbConnection);
    } else {
      logCheck("warn", "admin user checks", "skipped because users table is missing");
    }

    if (existingTables.includes("branches") && existingTables.includes("cities")) {
      await checkBranchRuntimeState(dbConnection);
    } else {
      logCheck(
        "warn",
        "branch runtime checks",
        "skipped because branches/cities tables are missing",
      );
    }
  } catch (error) {
    logCheck("fail", "database inspection", error.message);
    process.exitCode = 1;
  } finally {
    if (dbConnection) {
      try {
        await dbConnection.end();
      } catch {}
    }
  }

  console.log("\nBootstrap doctor finished.");
}

run().catch((error) => {
  console.error("Bootstrap doctor failed:", error);
  process.exit(1);
});
