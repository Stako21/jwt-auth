import test from "node:test";
import assert from "node:assert/strict";
import { createTroAdministrationService, getTroRevisionBlock } from "../services/troAdministration.service.js";

const ADMIN = { id: 7, role: 1, branchId: 1 };
const request = (expectedStatus = "NOT_COMPLETED") => ({ expectedStatus, comment: "  Помилково підписано  " });
const document = (overrides = {}) => ({
  id: 125, document_type: "TRO", branch_id: 2, status: "NOT_COMPLETED",
  signed_by_user_id: 15, signed_at: "2026-10-01", ...overrides,
});

function fixture(initial = document(), { executions = [], failHistory = false, loseUpdate = false } = {}) {
  let stored = structuredClone(initial);
  let history = [];
  let tail = Promise.resolve();
  let connections = 0;
  const notifications = [];
  const queries = [];
  async function query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes("SELECT d.id")) {
      assert.match(sql, /d\.document_type = 'TRO' AND d\.branch_id IN/);
      return [[stored?.id === values[0] && stored.document_type === "TRO" && values.slice(1).includes(stored.branch_id) ? structuredClone(stored) : undefined].filter(Boolean)];
    }
    if (sql.includes("SELECT id FROM tro_1c_execution_documents")) return [executions];
    if (sql.includes("UPDATE tro_document_details SET status_sync_requested_at")) {
      stored.status_sync_requested_at = sql.includes("= NULL") ? null : new Date("2026-10-31T10:00:00Z");
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("UPDATE documents")) {
      assert.deepEqual(values.slice(1), [125, 2, stored.status]);
      if (loseUpdate) return [{ affectedRows: 0 }];
      stored.status = values[0];
      if (sql.includes("signed_by_user_id = NULL")) Object.assign(stored, { signed_by_user_id: null, signed_at: null });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("INSERT INTO document_history")) {
      if (failHistory) throw new Error("history write failed");
      history.push(values);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  }
  const db = {
    query,
    async getConnection() {
      connections += 1;
      let unlock;
      let snapshot;
      let historySnapshot;
      return {
        query,
        async beginTransaction() {
          const previous = tail;
          tail = new Promise((resolve) => { unlock = resolve; });
          await previous;
          snapshot = structuredClone(stored);
          historySnapshot = structuredClone(history);
        },
        async commit() {},
        async rollback() { stored = snapshot; history = historySnapshot; },
        release() { unlock?.(); },
      };
    },
  };
  const service = createTroAdministrationService({
    db, visibleBranches: async () => [1, 2],
    notify: async (user, id, oldStatus) => {
      assert.equal(stored.status, "REVISION");
      assert.equal(history.length, 1);
      notifications.push({ user, id, oldStatus });
    },
  });
  return { service, notifications, queries, get doc() { return stored; }, get history() { return history; }, get connections() { return connections; } };
}

test("only Admin may execute or inspect administrative actions, including a forged integration principal", async () => {
  const f = fixture();
  for (const role of [2, 3, 4, 5, 6, 7, 8, 9, undefined]) {
    await assert.rejects(f.service.execute({ ...ADMIN, role }, 125, "cancel", request()), { status: 403, code: "TRO_ADMIN_REQUIRED" });
    await assert.rejects(f.service.options({ ...ADMIN, role }, 125), { status: 403 });
  }
  await assert.rejects(f.service.execute({ ...ADMIN, principalType: "integration" }, 125, "cancel", request()), { status: 403 });
  assert.equal(f.connections, 0);
});

test("branch scope and TRO type are checked inside the locked load", async () => {
  for (const row of [document({ branch_id: 9 }), document({ document_type: "RETURN" }), document({ document_type: "EXCHANGE" })]) {
    const f = fixture(row);
    await assert.rejects(f.service.execute(ADMIN, 125, "cancel", request()), { status: 404, code: "TRO_NOT_FOUND" });
    assert.deepEqual(f.doc, row);
    assert.equal(f.history.length, 0);
    assert.match(f.queries[0].sql, /FOR UPDATE/);
  }
});

test("revision clears the old signature, records the administrator/reason and notifies after commit in the document branch", async () => {
  const f = fixture();
  assert.deepEqual(await f.service.execute(ADMIN, 125, "revision", request()), { status: "REVISION", idempotent: false });
  await Promise.resolve();
  assert.equal(f.doc.signed_by_user_id, null);
  assert.equal(f.doc.signed_at, null);
  assert.deepEqual(f.history, [[125, 7, "ADMIN_REVISION", "NOT_COMPLETED", "REVISION", "Помилково підписано"]]);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].user.branchId, 2);
  assert.deepEqual(await f.service.execute(ADMIN, 125, "revision", request()), { status: "REVISION", idempotent: true });
  assert.equal(f.history.length, 1);
  assert.equal(f.notifications.length, 1);
});

test("unlinked NEW, Portal REJECTED and CANCELLED can return for correction; REVISION repeats are idempotent", async () => {
  for (const status of ["NEW", "REJECTED", "CANCELLED", "REVISION"]) {
    const f = fixture(document({ status }));
    await f.service.execute(ADMIN, 125, "revision", request(status));
    assert.equal(f.doc.status, "REVISION");
    assert.equal(f.history.length, status === "REVISION" ? 0 : 1);
  }
});

test("revision rejects every UP/accounting marker and active execution, even if there is no parent link", async () => {
  const markers = [
    "document_1c_guid", "source_system", "one_c_stage", "up_document_number", "document_1c_date",
    "executor_guid", "executor_name", "one_c_sales_agent_id", "one_c_sales_agent_guid", "one_c_sales_agent_name",
    "warehouse_guid", "one_c_stage_updated_at", "one_c_observed_at", "last_synced_at", "last_sync_error",
    "rejected_by_1c_guid", "rejected_by_1c_name", "accountant_user_id", "completed_by_user_id", "completed_at",
    "app_install", "photo_install", "app_return", "warehouse_spec_return",
  ];
  for (const marker of markers) {
    const row = document({ [marker]: 1 });
    const f = fixture(row);
    await assert.rejects(f.service.execute(ADMIN, 125, "revision", request()), { status: 409 });
    assert.deepEqual(f.doc, row);
    assert.equal(f.history.length, 0);
    assert.equal(f.notifications.length, 0);
  }
  const f = fixture(document(), { executions: [{ id: 41, confirmed: true }] });
  await assert.rejects(f.service.execute(ADMIN, 125, "revision", request()), { code: "TRO_PROCESSED_IN_UP" });
  for (const [status, code] of [["PLANNED", "TRO_ALREADY_PLANNED"], ["COMPLETED", "TRO_ALREADY_COMPLETED"]]) {
    await assert.rejects(fixture(document({ status })).service.execute(ADMIN, 125, "revision", request(status)), { status: 409, code });
  }
});

test("Admin cancellation accepts every stage and retains all integration, accounting and signature data", async () => {
  for (const status of ["NEW", "REVISION", "NOT_COMPLETED", "REJECTED", "PLANNED", "COMPLETED", "CANCELLED"]) {
    const row = document({ status, document_1c_guid: "guid", source_system: "UP", one_c_stage: "COMPLETED", up_document_number: "УП001", app_install: 1, accountant_user_id: 10, completed_at: "2026-10-01" });
    const f = fixture(row, { executions: [{ id: 41 }] });
    const result = await f.service.execute(ADMIN, 125, "cancel", request(status));
    assert.deepEqual(f.doc, { ...row, status: "CANCELLED" });
    assert.equal(result.idempotent, status === "CANCELLED");
    assert.deepEqual(f.history, status === "CANCELLED" ? [] : [[125, 7, "ADMIN_CANCEL", status, "CANCELLED", "Помилково підписано"]]);
    assert.equal(f.notifications.length, 0);
    assert.equal(f.queries.some(({ sql }) => /UPDATE tro_|DELETE/.test(sql)), false);
  }
});

test("stale status and lost conditional update are rejected without changes", async () => {
  for (const f of [fixture(document({ status: "PLANNED" })), fixture(document(), { loseUpdate: true })]) {
    const before = structuredClone(f.doc);
    await assert.rejects(f.service.execute(ADMIN, 125, "cancel", request()), { status: 409, code: "TRO_CONCURRENT_CHANGE" });
    assert.deepEqual(f.doc, before);
    assert.equal(f.history.length, 0);
  }
});

test("transaction rollback preserves the status/signature and sends nothing when history fails", async () => {
  for (const action of ["revision", "cancel"]) {
    const f = fixture(document(), { failHistory: true });
    await assert.rejects(f.service.execute(ADMIN, 125, action, request()), /history write failed/);
    await Promise.resolve();
    assert.deepEqual(f.doc, document());
    assert.equal(f.notifications.length, 0);
  }
});

test("parallel repeated requests create only one history event", async () => {
  const f = fixture();
  const results = await Promise.all([f.service.execute(ADMIN, 125, "cancel", request()), f.service.execute(ADMIN, 125, "cancel", request())]);
  assert.deepEqual(results.map((item) => item.idempotent), [false, true]);
  assert.equal(f.history.length, 1);
});

test("competing administrative actions reject the stale request after obtaining the document lock", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.service.execute(ADMIN, 125, "revision", request()),
    f.service.execute(ADMIN, 125, "cancel", request()),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].reason.code, "TRO_CONCURRENT_CHANGE");
  assert.equal(f.doc.status, "REVISION");
  assert.equal(f.history.length, 1);
});

test("required reason, bounded length, expected status and valid ID are enforced before writes", async () => {
  const f = fixture();
  for (const payload of [{ ...request(), comment: " " }, { ...request(), comment: "a".repeat(251) }, { comment: "reason" }]) {
    await assert.rejects(f.service.execute(ADMIN, 125, "cancel", payload), { status: 422 });
  }
  await assert.rejects(f.service.execute(ADMIN, "125 OR 1=1", "cancel", request()), { status: 400 });
  assert.equal(f.connections, 0);
});

test("server action options match revision restrictions and expose cancellation even on completed/linked documents", async () => {
  assert.deepEqual(await fixture().service.options(ADMIN, 125), { canCancel: true, canRevise: true, revisionBlockedReason: null });
  const options = await fixture(document({ status: "COMPLETED", document_1c_guid: "guid" })).service.options(ADMIN, 125);
  assert.equal(options.canCancel, true);
  assert.equal(options.canRevise, false);
  assert.ok(options.revisionBlockedReason);
  const cancelled = await fixture(document({ status: "CANCELLED" })).service.options(ADMIN, 125);
  assert.equal(cancelled.canCancel, false);
  assert.equal(cancelled.canRevise, true);
  assert.equal(getTroRevisionBlock(document({ app_install: 0 })), null);
});

test("manual synchronization registers terminal linked TRO without changing workflow, signatures or integration snapshots", async () => {
  for (const status of ["PLANNED", "COMPLETED", "CANCELLED"]) {
    const row = document({ status, one_c_stage: "COMPLETED", source_system: "UP", document_1c_guid: "guid",
      completed_at: "2026-10-30", app_install: 1, up_document_number: "UP001" });
    const f = fixture(row);
    const result = await f.service.execute(ADMIN, 125, "sync", request(status));
    assert.equal(result.idempotent, false);
    assert.deepEqual(f.doc, { ...row, status_sync_requested_at: new Date("2026-10-31T10:00:00Z") });
    assert.deepEqual(f.history, [[125, 7, "ADMIN_SYNC_REQUEST", status, status, "Помилково підписано"]]);
    assert.equal(f.notifications.length, 0);
    assert.equal(f.queries.some(({ sql }) => sql.includes("UPDATE documents")), false);
    const again = await f.service.execute(ADMIN, 125, "sync", request(status));
    assert.equal(again.already_pending, true);
    assert.equal(f.history.length, 1);
    assert.equal(f.queries.filter(({ sql }) => sql.includes("UPDATE tro_document_details")).length, 1);
  }
});

test("synchronization leaves naturally pending requests untouched, including cancellation conflicts", async () => {
  for (const [stage, status, executions] of [
    [null, "PLANNED", []], ["NEW", "PLANNED", []], ["IN_PROGRESS", "COMPLETED", []],
    ["CANCELLED", "PLANNED", []], ["CANCELLED", "COMPLETED", [{ id: 9 }]],
  ]) {
    const row = document({ status, one_c_stage: stage, document_1c_guid: "guid", source_system: "UP" });
    const f = fixture(row, { executions });
    assert.equal((await f.service.execute(ADMIN, 125, "sync", request(status))).already_pending, true);
    assert.deepEqual(f.doc, row);
    assert.equal(f.history.length, 0);
  }
});

test("sync enforces Admin, link, branch, expected status and atomic history", async () => {
  await assert.rejects(fixture().service.execute({ ...ADMIN, role: 2 }, 125, "sync", request()), { status: 403 });
  await assert.rejects(fixture().service.execute({ ...ADMIN, principalType: "integration" }, 125, "sync", request()), { status: 403 });
  await assert.rejects(fixture().service.execute(ADMIN, 125, "sync", request()), { code: "TRO_ONE_C_LINK_REQUIRED" });
  const row = document({ status: "COMPLETED", one_c_stage: "COMPLETED", document_1c_guid: "guid", source_system: "UP" });
  await assert.rejects(fixture({ ...row, branch_id: 9 }).service.execute(ADMIN, 125, "sync", request("COMPLETED")), { status: 404 });
  await assert.rejects(fixture(row).service.execute(ADMIN, 125, "sync", request()), { code: "TRO_CONCURRENT_CHANGE" });
  const f = fixture(row, { failHistory: true });
  await assert.rejects(f.service.execute(ADMIN, 125, "sync", request("COMPLETED")), /history write failed/);
  assert.deepEqual(f.doc, row);
  const concurrent = fixture(row);
  const results = await Promise.all([1, 2].map(() => concurrent.service.execute(ADMIN, 125, "sync", request("COMPLETED"))));
  assert.deepEqual(results.map((result) => result.idempotent), [false, true]);
  assert.equal(concurrent.history.length, 1);
});

const REGISTERED_AT = "2026-11-01T16:00:00.123Z";
const removalRequest = (overrides = {}) => ({ ...request("COMPLETED"), expectedSyncRequestedAt: REGISTERED_AT, ...overrides });
const registeredDocument = (overrides = {}) => document({ status: "COMPLETED", one_c_stage: "COMPLETED",
  document_1c_guid: "guid", source_system: "UP", status_sync_requested_at: REGISTERED_AT, ...overrides });

test("unregister removes only the manual marker, preserves document data and records one audited idempotent action", async () => {
  const row = registeredDocument({ app_install: 1, completed_at: "2026-10-30", up_document_number: "UP001" });
  const f = fixture(row);
  assert.deepEqual(await f.service.execute(ADMIN, 125, "unsync", removalRequest()), {
    status: "COMPLETED", idempotent: false, still_pending: false,
  });
  assert.deepEqual(f.doc, { ...row, status_sync_requested_at: null });
  assert.deepEqual(f.history, [[125, 7, "ADMIN_SYNC_UNREGISTER", "COMPLETED", "COMPLETED", "Помилково підписано"]]);
  const again = await f.service.execute(ADMIN, 125, "unsync", removalRequest());
  assert.equal(again.idempotent, true);
  assert.equal(f.history.length, 1);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.queries.some(({ sql }) => /UPDATE documents|DELETE/.test(sql)), false);
});

test("unregister preserves natural pending states and cancellation conflicts", async () => {
  for (const [stage, status, executions] of [
    [null, "PLANNED", []], ["NEW", "PLANNED", []], ["IN_PROGRESS", "COMPLETED", []],
    ["CANCELLED", "PLANNED", []], ["CANCELLED", "COMPLETED", [{ id: 9 }]],
  ]) {
    const row = registeredDocument({ one_c_stage: stage, status });
    const f = fixture(row, { executions });
    const result = await f.service.execute(ADMIN, 125, "unsync", removalRequest({ expectedStatus: status }));
    assert.equal(result.still_pending, true);
    assert.deepEqual(f.doc, { ...row, status_sync_requested_at: null });
    assert.equal(f.notifications.length, 0);
  }
  const f = fixture(registeredDocument({ status_sync_requested_at: null, one_c_stage: "IN_PROGRESS" }));
  const result = await f.service.execute(ADMIN, 125, "unsync", removalRequest());
  assert.equal(result.idempotent, true);
  assert.equal(result.still_pending, true);
  assert.equal(f.history.length, 0);
  const unlinked = fixture(registeredDocument({ document_1c_guid: null, one_c_stage: "IN_PROGRESS" }));
  assert.equal((await unlinked.service.execute(ADMIN, 125, "unsync", removalRequest())).still_pending, false);
});

test("unregister enforces Admin, visible TRO branch, expected workflow and exact registration timestamp", async () => {
  for (const user of [{ ...ADMIN, role: 2 }, { ...ADMIN, principalType: "integration" }]) {
    const f = fixture(registeredDocument());
    await assert.rejects(f.service.execute(user, 125, "unsync", removalRequest()), { status: 403 });
    assert.equal(f.connections, 0);
  }
  for (const row of [registeredDocument({ branch_id: 9 }), registeredDocument({ document_type: "RETURN" })]) {
    const f = fixture(row);
    await assert.rejects(f.service.execute(ADMIN, 125, "unsync", removalRequest()), { status: 404 });
    assert.deepEqual(f.doc, row);
  }
  const f = fixture(registeredDocument());
  await assert.rejects(f.service.execute(ADMIN, 125, "unsync", removalRequest({ expectedStatus: "PLANNED" })), { code: "TRO_CONCURRENT_CHANGE" });
  await assert.rejects(f.service.execute(ADMIN, 125, "unsync", removalRequest({ expectedSyncRequestedAt: "2026-11-01T15:59:59Z" })), { code: "TRO_SYNC_REGISTRATION_CHANGED" });
  for (const invalid of [null, undefined, "bad", 123]) {
    await assert.rejects(f.service.execute(ADMIN, 125, "unsync", removalRequest({ expectedSyncRequestedAt: invalid })), { status: 422 });
  }
  assert.equal(f.doc.status_sync_requested_at, REGISTERED_AT);
  assert.equal(f.history.length, 0);
});

test("unregister rolls back on history failure and serializes parallel removals", async () => {
  const row = registeredDocument();
  const failed = fixture(row, { failHistory: true });
  await assert.rejects(failed.service.execute(ADMIN, 125, "unsync", removalRequest()), /history write failed/);
  assert.deepEqual(failed.doc, row);
  const f = fixture(row);
  const results = await Promise.all([1, 2].map(() => f.service.execute(ADMIN, 125, "unsync", removalRequest())));
  assert.deepEqual(results.map(result => result.idempotent), [false, true]);
  assert.equal(f.history.length, 1);
});
