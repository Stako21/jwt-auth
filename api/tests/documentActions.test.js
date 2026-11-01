import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentActionsService } from "../services/documentActions.service.js";
import { TroAdministrationError } from "../services/troAdministration.service.js";
import { up, down } from "../migrations/033_tro_status_sync_requests.js";

const ADMIN = { id: 7, role: 1 };
const payload = (overrides = {}) => ({ action: "sync", comment: "Перевірка видалення в УП",
  documents: [{ id: 125, expectedStatus: "COMPLETED" }], ...overrides });

test("batch and document list deny other roles and integration principals before any work", async () => {
  const service = createDocumentActionsService({ db: { query() { assert.fail("DB access"); } },
    visibleBranches() { assert.fail("scope access"); }, administration: { execute() { assert.fail("write"); } } });
  for (const user of [{ role: 2 }, { role: 9 }, { ...ADMIN, principalType: "integration" }, null]) {
    await assert.rejects(service.list(user), { status: 403 });
    await assert.rejects(service.execute(user, payload()), { status: 403 });
  }
});

test("batch validates explicit unique bounded IDs, status, action and reason before mutations", async () => {
  const service = createDocumentActionsService({ administration: { execute() { assert.fail("write"); } } });
  for (const change of [
    { documents: [] }, { documents: [125] }, { documents: [{ id: "125", expectedStatus: "COMPLETED" }] },
    { documents: [{ id: 0, expectedStatus: "COMPLETED" }] }, { documents: [{ id: 125 }] },
    { documents: Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, expectedStatus: "NEW" })) },
    { documents: [{ id: 125, expectedStatus: "NEW" }, { id: 125, expectedStatus: "NEW" }] },
    { action: "delete" }, { comment: " " }, { comment: "x".repeat(251) },
  ]) await assert.rejects(service.execute(ADMIN, payload(change)), { status: 422 });
});

test("batch continues after per-document access, restriction and concurrency errors and masks unexpected details", async () => {
  const calls = [];
  const service = createDocumentActionsService({ administration: {
    async execute(user, id, action, request) {
      calls.push({ user, id, action, request });
      if (id === 1) return { status: "COMPLETED", idempotent: false };
      if (id === 2) return { status: "COMPLETED", idempotent: true, already_pending: true };
      if (id === 3) throw new TroAdministrationError(404, "TRO_NOT_FOUND", "Немає доступу");
      if (id === 4) throw new TroAdministrationError(409, "TRO_CONCURRENT_CHANGE", "Статус змінився");
      if (id === 5) throw new Error("secret SQL password server path");
      return { status: "COMPLETED", idempotent: false };
    },
  } });
  const result = await service.execute(ADMIN, payload({ documents: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, expectedStatus: "COMPLETED" })) }));
  assert.equal(calls.length, 6);
  assert.deepEqual([result.completed, result.unchanged, result.failed], [2, 1, 3]);
  assert.deepEqual(calls[0], { user: ADMIN, id: 1, action: "sync", request: { comment: payload().comment, expectedStatus: "COMPLETED" } });
  assert.equal(result.results[4].code, "TRO_ADMIN_FAILED");
  assert.doesNotMatch(JSON.stringify(result), /secret|password|SQL/);
  assert.equal(result.results[5].outcome, "completed");
});

test("batch accepts exactly 1000 explicit documents and forwards removal concurrency tokens", async () => {
  const calls = [];
  const service = createDocumentActionsService({ administration: {
    async execute(user, id, action, request) {
      calls.push({ user, id, action, request });
      return { status: "COMPLETED", idempotent: false };
    },
  } });
  const expectedSyncRequestedAt = "2026-11-01T16:00:00.123Z";
  const documents = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, expectedStatus: "COMPLETED", expectedSyncRequestedAt }));
  const result = await service.execute(ADMIN, payload({ action: "unsync", documents }));
  assert.equal(result.completed, 1000);
  assert.equal(calls.length, 1000);
  assert.deepEqual(calls[999], { user: ADMIN, id: 1000, action: "unsync",
    request: { comment: payload().comment, expectedStatus: "COMPLETED", expectedSyncRequestedAt } });
  for (const invalid of [undefined, null, "invalid", 123]) {
    await assert.rejects(service.execute(ADMIN, payload({ action: "unsync",
      documents: [{ id: 1, expectedStatus: "COMPLETED", expectedSyncRequestedAt: invalid }] })), { status: 422 });
  }
  assert.equal(calls.length, 1000);
});

test("list applies branch isolation, period, literal search and stable pagination on the server", async () => {
  const queries = [];
  const db = { async query(sql, params) {
    queries.push({ sql, params });
    return sql.includes("COUNT(*)") ? [[{ total: 2400 }]] : [[{ id: 125, document_date: new Date("2026-10-30T22:00:00Z") }]];
  } };
  const service = createDocumentActionsService({ db, visibleBranches: async () => [2, 4] });
  const result = await service.list(ADMIN, { dateFrom: "2026-10-01", dateTo: "2026-10-31", status: "COMPLETED", search: "УП_%", page: 2 });
  assert.deepEqual(result, { data: [{ id: 125, document_date: "2026-10-31" }], total: 2400, page: 2, pageSize: 1000 });
  for (const { sql, params } of queries) {
    assert.match(sql, /d\.document_type = 'TRO' AND d\.branch_id IN \(\?,\?\)/);
    assert.match(sql, /ci\.branch_id = d\.branch_id/);
    assert.match(sql, /c\.branch_id = d\.branch_id/);
    assert.match(sql, /tp\.branch_id = d\.branch_id/);
    assert.match(sql, /d\.document_date < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
    assert.match(sql, /ex\.portal_document_id = d\.id/);
    assert.doesNotMatch(sql, /УП_%/);
    assert.deepEqual(params.slice(0, 5), [2, 4, "2026-10-01", "2026-10-31", "COMPLETED"]);
  }
  assert.match(queries[1].sql, /ORDER BY d\.document_date DESC, d\.id DESC LIMIT \? OFFSET \?/);
  assert.deepEqual(queries[1].params.slice(-2), [1000, 1000]);
});

test("pending view filters the complete manual and natural queue before count and pagination without widening branches", async () => {
  const queries = [];
  const db = { async query(sql, params) {
    queries.push({ sql, params });
    return sql.includes("COUNT(*)") ? [[{ total: 0 }]] : [[]];
  } };
  const service = createDocumentActionsService({ db, visibleBranches: async () => [2, 4] });
  await service.list(ADMIN, { view: "sync-pending", dateFrom: "", dateTo: "" });
  for (const { sql, params } of queries) {
    assert.match(sql, /WHERE d\.document_type = 'TRO' AND d\.branch_id IN \(\?,\?\) AND td\.document_1c_guid IS NOT NULL/);
    assert.match(sql, /td\.status_sync_requested_at IS NOT NULL/);
    assert.match(sql, /td\.one_c_stage IN \('NEW', 'IN_PROGRESS'\)/);
    assert.match(sql, /te\.portal_document_id = d\.id/);
    assert.doesNotMatch(sql, /d\.document_date >=|d\.document_date < DATE_ADD/);
    assert.deepEqual(params.slice(0, 2), [2, 4]);
  }
  assert.deepEqual(queries[1].params.slice(-2), [1000, 0]);
  await assert.rejects(service.list(ADMIN, { view: "unknown" }), { code: "INVALID_DOCUMENT_VIEW" });
  assert.equal(queries.length, 2);
});

test("list supports independently open dates and rejects malformed filters or empty scope", async () => {
  let writes = 0;
  const db = { async query(sql) { writes++; return sql.includes("COUNT(*)") ? [[{ total: 0 }]] : [[]]; } };
  const service = createDocumentActionsService({ db, visibleBranches: async () => [2] });
  for (const query of [{ dateFrom: "2026-02-30" }, { dateTo: "x" }, { dateFrom: "2026-11-01", dateTo: "2026-10-01" }, { page: -1 }, { page: "1 OR 1=1" }, { status: "SIGNED" }]) {
    await assert.rejects(service.list(ADMIN, query), { status: 422 });
  }
  assert.equal(writes, 0);
  await service.list(ADMIN, { dateFrom: "", dateTo: "2026-10-31" });
  await service.list(ADMIN, { dateFrom: "2026-10-01", dateTo: "" });
  await assert.rejects(createDocumentActionsService({ db, visibleBranches: async () => [] }).list(ADMIN), { status: 403 });
});

test("migration 033 is additive, preserves existing rows and is repeatable", async () => {
  let exists = false;
  const mutations = [];
  const db = { async query(sql) {
    if (sql.includes("information_schema")) return [exists ? [{ present: 1 }] : []];
    mutations.push(sql);
    exists = sql.includes("ADD COLUMN");
    return [{}];
  } };
  await up(db); await up(db);
  assert.equal(mutations.length, 1);
  assert.match(mutations[0], /status_sync_requested_at DATETIME\(3\) NULL DEFAULT NULL/);
  assert.doesNotMatch(mutations[0], /UPDATE|DELETE/);
  await down(db); await down(db);
  assert.equal(mutations.length, 2);
});
