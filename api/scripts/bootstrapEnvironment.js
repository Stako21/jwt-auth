import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRootDir = path.join(__dirname, "..");
const migrationsDir = path.join(apiRootDir, "migrations");

dotenv.config({ path: path.join(apiRootDir, ".env") });

const DEFAULT_ADMIN_LOGIN = process.env.BOOTSTRAP_ADMIN_LOGIN || "admin";
const DEFAULT_ADMIN_PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD || "ChangeMe123!";
const DEFAULT_ADMIN_DISPLAY_NAME =
  process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || "Адміністратор";
const DEFAULT_ADMIN_ROLE = 1;
const DEFAULT_BRANCH_ID = Number(process.env.BOOTSTRAP_ADMIN_BRANCH_ID || 1);

const LEGACY_TABLE_HINTS = [
  "users",
  "refresh_sessions",
  "user_hierarchy",
  "sales_reports",
  "report_imports",
  "sales_agents",
  "region_notifications",
];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getAdminConnectionConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_BOOTSTRAP_USER || getRequiredEnv("DB_USER"),
    password: process.env.DB_BOOTSTRAP_PASSWORD || getRequiredEnv("DB_PASSWORD"),
    charset: process.env.DB_CHARSET || "utf8mb4",
    multipleStatements: false,
  };
}

function getDatabaseName() {
  return process.env.DB_NAME || "auth";
}

async function createDatabaseIfMissing(connection, dbName) {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.query("SELECT name FROM schema_migrations");
  return new Set(rows.map((row) => row.name));
}

async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDir);
  return entries.filter((file) => file.endsWith(".js")).sort();
}

async function runMigrations(connection) {
  await ensureMigrationsTable(connection);

  const applied = await getAppliedMigrations(connection);
  const files = await getMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping migration ${file}`);
      continue;
    }

    const migrationUrl = pathToFileURL(path.join(migrationsDir, file)).href;
    const migration = await import(migrationUrl);

    if (typeof migration.up !== "function") {
      throw new Error(`Migration ${file} does not export up(connection)`);
    }

    console.log(`Running migration ${file}`);
    await migration.up(connection);
    await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    console.log(`Applied migration ${file}`);
  }
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

async function resolveAdminCityId(connection, branchId) {
  const [[city]] = await connection.query(
    `
    SELECT id
    FROM cities
    WHERE branch_id = ?
      AND is_active = 1
    ORDER BY sort_order, id
    LIMIT 1
    `,
    [branchId],
  );

  return city?.id ? Number(city.id) : null;
}

async function seedDefaultAdmin(connection, dbName) {
  const existingTables = await listExistingTables(connection, dbName);

  if (!existingTables.includes("users")) {
    console.warn(
      "Skipping default admin seed: table `users` is missing. Import the legacy base schema first.",
    );
    return { created: false, skipped: true, reason: "users_table_missing" };
  }

  const userColumns = await getTableColumns(connection, dbName, "users");
  const requiredUserColumns = ["name", "password", "role"];
  const missingColumns = requiredUserColumns.filter(
    (column) => !userColumns.includes(column),
  );

  if (missingColumns.length) {
    console.warn(
      `Skipping default admin seed: table \`users\` is missing required columns: ${missingColumns.join(", ")}`,
    );
    return { created: false, skipped: true, reason: "users_columns_missing" };
  }

  const [[existingAdmin]] = await connection.query(
    `
    SELECT id, name
    FROM users
    WHERE name = ?
    LIMIT 1
    `,
    [DEFAULT_ADMIN_LOGIN],
  );

  if (existingAdmin) {
    console.log(
      `Default admin seed skipped: user \`${DEFAULT_ADMIN_LOGIN}\` already exists (id=${existingAdmin.id}).`,
    );
    return { created: false, skipped: true, reason: "admin_already_exists" };
  }

  const branchId = userColumns.includes("branch_id") ? DEFAULT_BRANCH_ID : null;
  const cityId =
    userColumns.includes("city") && branchId
      ? await resolveAdminCityId(connection, branchId)
      : null;

  const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 8);
  const insertColumns = ["name", "password", "role"];
  const insertValues = [DEFAULT_ADMIN_LOGIN, hashedPassword, DEFAULT_ADMIN_ROLE];

  if (userColumns.includes("user_name")) {
    insertColumns.push("user_name");
    insertValues.push(DEFAULT_ADMIN_DISPLAY_NAME);
  }

  if (userColumns.includes("city")) {
    insertColumns.push("city");
    insertValues.push(cityId);
  }

  if (userColumns.includes("branch_id")) {
    insertColumns.push("branch_id");
    insertValues.push(branchId);
  }

  if (userColumns.includes("is_active")) {
    insertColumns.push("is_active");
    insertValues.push(1);
  }

  const placeholders = insertColumns.map(() => "?").join(", ");
  const [insertResult] = await connection.query(
    `
    INSERT INTO users (${insertColumns.join(", ")})
    VALUES (${placeholders})
    `,
    insertValues,
  );

  console.log(
    `Created default admin user \`${DEFAULT_ADMIN_LOGIN}\` (id=${insertResult.insertId}).`,
  );
  console.log(
    `Default admin password: ${DEFAULT_ADMIN_PASSWORD} (change it immediately after first login).`,
  );

  return {
    created: true,
    userId: Number(insertResult.insertId),
    login: DEFAULT_ADMIN_LOGIN,
  };
}

function printLegacySchemaWarning(existingTables) {
  const missingTables = LEGACY_TABLE_HINTS.filter(
    (tableName) => !existingTables.includes(tableName),
  );

  if (!missingTables.length) {
    console.log("Legacy runtime tables look present.");
    return;
  }

  console.warn("Fresh-bootstrap warning:");
  console.warn(
    `The repository still does not contain a full migration history for the legacy schema.`,
  );
  console.warn(
    `Missing likely-required legacy tables: ${missingTables.join(", ")}`,
  );
  console.warn(
    "The app may start partially, but some runtime areas can fail until the legacy base schema is imported or converted into migrations.",
  );
}

async function run() {
  const dbName = getDatabaseName();
  const serverConnection = await mysql.createConnection(getAdminConnectionConfig());

  try {
    console.log(`Ensuring database \`${dbName}\` exists...`);
    await createDatabaseIfMissing(serverConnection, dbName);
    await serverConnection.end();

    const dbConnection = await mysql.createConnection({
      ...getAdminConnectionConfig(),
      database: dbName,
      namedPlaceholders: true,
    });

    try {
      console.log(`Running migrations against \`${dbName}\`...`);
      await runMigrations(dbConnection);

      console.log("Checking table inventory...");
      const existingTables = await listExistingTables(dbConnection, dbName);
      printLegacySchemaWarning(existingTables);

      console.log("Seeding default admin if needed...");
      await seedDefaultAdmin(dbConnection, dbName);

      console.log("Bootstrap completed.");
    } finally {
      await dbConnection.end();
    }
  } catch (error) {
    console.error("Bootstrap failed:", error);
    process.exit(1);
  }
}

run();
