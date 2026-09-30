import test from "node:test";
import assert from "node:assert/strict";
import {
  clearImportRunJournalForTests,
  listImportRuns,
  recordImportRun,
} from "../services/importRunJournal.js";

test.beforeEach(() => {
  clearImportRunJournalForTests();
});

test("journal stores newest import runs first and exposes safe metadata", () => {
  recordImportRun({
    task: "loadProducts",
    label: "Load products",
    branch: { id: 1, slug: "main", name: "Main", shortName: "M" },
    trigger: "scheduled",
    startedAt: "2026-09-30T08:00:00.000Z",
    finishedAt: "2026-09-30T08:00:02.500Z",
    result: {
      status: "completed",
      code: "import_completed",
      message: "Products imported",
      details: { inserted: 10 },
    },
  });
  recordImportRun({
    task: "loadSalesReports",
    label: "Load sales reports",
    trigger: "manual",
    startedAt: "2026-09-30T09:00:00.000Z",
    finishedAt: "2026-09-30T09:00:01.000Z",
    result: {
      status: "completed_with_warnings",
      code: "import_completed_with_warnings",
      message: "Imported with warnings",
      details: { unresolved: 2 },
    },
  });

  const journal = listImportRuns({ now: new Date("2026-09-30T10:00:00.000Z") });
  assert.equal(journal.data.length, 2);
  assert.equal(journal.data[0].task, "loadSalesReports");
  assert.equal(journal.data[1].duration_ms, 2500);
  assert.equal(journal.data[1].branch.short_name, "M");
  assert.equal(journal.retentionDays, 7);
});

test("journal filters runs and removes entries older than seven days", () => {
  for (const [task, status, finishedAt] of [
    ["loadProducts", "completed", "2026-09-20T08:00:00.000Z"],
    ["loadProducts", "failed", "2026-09-29T08:00:00.000Z"],
    ["loadSalesReports", "failed", "2026-09-30T08:00:00.000Z"],
  ]) {
    recordImportRun({
      task,
      result: { status, message: status, details: {} },
      startedAt: finishedAt,
      finishedAt,
    });
  }

  const journal = listImportRuns({
    task: "loadProducts",
    status: "failed",
    now: new Date("2026-09-30T09:00:00.000Z"),
  });
  assert.equal(journal.data.length, 1);
  assert.equal(journal.data[0].finished_at, "2026-09-29T08:00:00.000Z");
});

test("journal removes secrets, stack traces and server directory paths", () => {
  recordImportRun({
    task: "loadSalesReports",
    finishedAt: "2026-09-30T08:00:00.000Z",
    result: {
      status: "failed",
      message: "Import failed for /var/www/data/excel/SalesReport.json token=secret",
      details: {
        file: "/var/www/data/excel/SalesReport.json",
        password: "secret",
        accessToken: "token",
        errorStack: "internal stack",
        nested: { authorization: "Bearer secret", rows: 15 },
      },
    },
  });

  const [entry] = listImportRuns({
    now: new Date("2026-09-30T09:00:00.000Z"),
  }).data;
  assert.equal(entry.details.file, "SalesReport.json");
  assert.equal(
    entry.message,
    "Import failed for SalesReport.json token=[redacted]",
  );
  assert.equal(entry.details.password, undefined);
  assert.equal(entry.details.accessToken, undefined);
  assert.equal(entry.details.errorStack, undefined);
  assert.equal(entry.details.nested.authorization, undefined);
  assert.equal(entry.details.nested.rows, 15);
});
