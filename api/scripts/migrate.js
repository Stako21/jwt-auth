import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import pool from "../db.cjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..", "migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations() {
  const [rows] = await pool.query("SELECT name FROM schema_migrations");
  return new Set(rows.map((row) => row.name));
}

async function getMigrationFiles() {
  const entries = await fs.readdir(migrationsDir);
  return entries.filter((file) => file.endsWith(".js")).sort();
}

async function run() {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const files = await getMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping migration ${file}`);
      continue;
    }

    const migrationUrl = pathToFileURL(path.join(migrationsDir, file)).href;
    const migration = await import(migrationUrl);

    if (typeof migration.up !== "function") {
      throw new Error(`Migration ${file} does not export up(pool)`);
    }

    console.log(`Running migration ${file}`);
    await migration.up(pool);
    await pool.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
    console.log(`Applied migration ${file}`);
  }

  await pool.end();
}

run().catch(async (error) => {
  console.error("Migration failed:", error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
