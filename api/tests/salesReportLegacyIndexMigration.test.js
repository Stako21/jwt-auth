import test from "node:test";
import assert from "node:assert/strict";
import { up } from "../migrations/030_sales_report_legacy_active_index.js";

function indexRows(columns, { unique = true } = {}) {
  return columns.map((columnName, index) => ({
    NON_UNIQUE: unique ? 0 : 1,
    COLUMN_NAME: columnName,
    SEQ_IN_INDEX: index + 1,
  }));
}

function migrationPool({ legacyColumns } = {}) {
  const statements = [];
  return {
    statements,
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql.includes("information_schema.tables")) return [[{ exists: 1 }]];
      if (sql.includes("information_schema.statistics")) {
        const indexName = params[1];
        if (indexName === "uq_sales_reports_active_document_guid") {
          return [indexRows(["branch_id", "active_document_guid"])];
        }
        if (indexName === "uk_active_doc") {
          return [legacyColumns === null
            ? []
            : indexRows(legacyColumns || [
              "document_number",
              "login_agent",
              "active_flag",
            ])];
        }
        if (indexName === "idx_sales_reports_branch_number_status") return [[]];
      }
      return [{ affectedRows: 0 }];
    },
  };
}

test("migration replaces the legacy global active index with a branch lookup index", async () => {
  const pool = migrationPool();
  await up(pool);

  assert.ok(pool.statements.some(({ sql }) => (
    sql.includes("DROP INDEX uk_active_doc")
  )));
  assert.ok(pool.statements.some(({ sql }) => (
    sql.includes("ADD INDEX idx_sales_reports_branch_number_status") &&
    sql.includes("branch_id, document_number, status")
  )));
});

test("migration is compatible with installations without the legacy index", async () => {
  const pool = migrationPool({ legacyColumns: null });
  await up(pool);

  assert.ok(!pool.statements.some(({ sql }) => (
    sql.includes("DROP INDEX uk_active_doc")
  )));
  assert.ok(pool.statements.some(({ sql }) => (
    sql.includes("ADD INDEX idx_sales_reports_branch_number_status")
  )));
});

test("migration refuses to drop an unexpectedly changed legacy index", async () => {
  const pool = migrationPool({ legacyColumns: ["document_number"] });
  await assert.rejects(
    () => up(pool),
    /uk_active_doc has an unexpected shape/,
  );
  assert.ok(!pool.statements.some(({ sql }) => (
    sql.includes("DROP INDEX uk_active_doc")
  )));
});
