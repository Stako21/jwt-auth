import test from "node:test";
import assert from "node:assert/strict";
import { createTroIntegrationService, IntegrationError } from "../services/TroIntegrationService.js";
import {
  denyOneCIntegrationAccount,
  ensureOneCIntegrationAccount,
} from "../middlewares/oneCIntegrationAccount.js";

const USER = { id: 900, branchId: 1, userName: "one_c_test" };
const CREATED_PAYLOAD = {
  portal_document_number: "ТРО-ZP-000125",
  document_1c_guid: "11111111-1111-4111-8111-111111111111",
  document_1c_number: "РП-005843",
  document_1c_date: "2026-09-06T12:15:35+03:00",
  sales_agent_guid: "22222222-2222-4222-8222-222222222222",
  sales_agent_name: "Іваненко Петро Іванович",
  source_system: "UP",
  warehouse_guid: null,
};

function document(overrides = {}) {
  return {
    id: 125,
    document_number: "ТРО-ZP-000125",
    document_type: "TRO",
    status: "NOT_COMPLETED",
    author_user_id: 10,
    branch_id: 1,
    ta_user_id: 20,
    movement_type: "INSTALL",
    up_document_number: null,
    executor_name: null,
    document_1c_guid: null,
    document_1c_date: null,
    source_system: null,
    executor_agent_guid: null,
    warehouse_guid: null,
    one_c_stage: null,
    one_c_stage_updated_at: null,
    ...overrides,
  };
}

function fakeRepository(initialDocuments = [document()]) {
  const documents = new Map(initialDocuments.map((item) => [item.id, item]));
  const history = [];
  let deleted = false;
  return {
    documents,
    history,
    get deleted() { return deleted; },
    async getAccessibleBranchIds() { return [1]; },
    async listReady({ branchIds, movementType, limit }) {
      return [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id)
        && item.document_type === "TRO"
        && item.status === "NOT_COMPLETED"
        && (!movementType || item.movement_type === movementType))
        .slice(0, limit)
        .map((item) => ({
          ...item,
          created_at: new Date(), updated_at: new Date(), comment: null,
          branch_name: "Філія", trade_point_guid: "tp", trade_point_name: "ТТ",
          trade_point_address: "Адреса", contractor_guid: "co", contractor_name: "Контрагент",
          request_agent_guid: "agent", request_agent_name: "ТА заявки",
        }));
    },
    async getItems() { return []; },
    async listPending({ branchIds }) {
      return [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id) && item.document_1c_guid
        && item.status !== "REJECTED" && [null, "NEW", "IN_PROGRESS"].includes(item.one_c_stage));
    },
    async transaction(work) { return work({}); },
    async lockDocument(_connection, id) { return documents.get(Number(id)) || null; },
    async findDocumentByExternalGuid(_connection, source, guid) {
      const match = [...documents.values()].find((item) =>
        item.source_system === source && item.document_1c_guid === guid);
      return match ? { document_id: match.id } : null;
    },
    async findSalesAgents() {
      return [{ id: 77, user_id: 20, full_name: CREATED_PAYLOAD.sales_agent_name, user_name: CREATED_PAYLOAD.sales_agent_name }];
    },
    async saveCreated(_connection, values) {
      const item = documents.get(values.documentId);
      Object.assign(item, {
        document_1c_guid: values.documentGuid,
        document_1c_date: values.documentDate,
        source_system: values.sourceSystem,
        up_document_number: values.documentNumber,
        executor_name: values.agentName,
        executor_sales_agent_id: values.salesAgentId,
        executor_agent_guid: values.agentGuid,
        warehouse_guid: values.warehouseGuid,
        one_c_stage: "NEW",
        status: item.status === "NOT_COMPLETED" ? "PLANNED" : item.status,
      });
    },
    async saveStage(_connection, id, stage, changedAt) {
      Object.assign(documents.get(id), { one_c_stage: stage, one_c_stage_updated_at: changedAt });
    },
    async reject(_connection, id) { documents.get(id).status = "REJECTED"; },
    async addHistory(_connection, entry) { history.push(entry); },
    async getLastHistoryComment(_connection, id, action) {
      return [...history].reverse().find((item) => item.documentId === id && item.action === action)?.comment ?? null;
    },
    async delete() { deleted = true; },
  };
}

test("GET returns NOT_COMPLETED documents and excludes NEW", async () => {
  const repo = fakeRepository([document(), document({ id: 126, status: "NEW", document_number: "ТРО-ZP-000126" })]);
  const result = await createTroIntegrationService(repo).listReady(USER);
  assert.deepEqual(result.map((item) => item.portal_document_id), [125]);
  assert.equal(result[0].status, "NOT_COMPLETED");
});

test("created links 1C, preserves author/TA and moves to PLANNED", async () => {
  const repo = fakeRepository();
  const before = { author: repo.documents.get(125).author_user_id, ta: repo.documents.get(125).ta_user_id };
  const result = await createTroIntegrationService(repo).created(USER, 125, CREATED_PAYLOAD);
  const saved = repo.documents.get(125);
  assert.equal(result.portal_status, "PLANNED");
  assert.equal(saved.author_user_id, before.author);
  assert.equal(saved.ta_user_id, before.ta);
  assert.equal(saved.up_document_number, CREATED_PAYLOAD.document_1c_number);
  assert.equal(saved.executor_name, CREATED_PAYLOAD.sales_agent_name);
  assert.equal(saved.document_1c_guid, CREATED_PAYLOAD.document_1c_guid);
  assert.equal(repo.history.length, 1);
});

test("repeated equivalent created is idempotent and later status is not rolled back", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  repo.documents.get(125).status = "COMPLETED";
  const result = await service.created(USER, 125, CREATED_PAYLOAD);
  assert.equal(result.idempotent, true);
  assert.equal(repo.documents.get(125).status, "COMPLETED");
  assert.equal(repo.history.length, 1);
});

test("different GUID cannot replace an existing link", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  await assert.rejects(
    service.created(USER, 125, { ...CREATED_PAYLOAD, document_1c_guid: "33333333-3333-4333-8333-333333333333" }),
    (error) => error instanceof IntegrationError && error.status === 409,
  );
});

test("one 1C GUID cannot be linked to two portal documents", async () => {
  const repo = fakeRepository([
    document(),
    document({ id: 126, document_number: "ТРО-ZP-000126" }),
  ]);
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  await assert.rejects(
    service.created(USER, 126, { ...CREATED_PAYLOAD, portal_document_number: "ТРО-ZP-000126" }),
    (error) => error.code === "ONE_C_DOCUMENT_ALREADY_LINKED",
  );
});

test("missing sales agent does not block linking and returns a warning", async () => {
  const repo = fakeRepository();
  repo.findSalesAgents = async () => [];
  const result = await createTroIntegrationService(repo).created(USER, 125, CREATED_PAYLOAD);
  assert.match(result.warning, /не знайдено/);
  assert.equal(repo.documents.get(125).executor_sales_agent_id, null);
  assert.equal(repo.documents.get(125).executor_name, CREATED_PAYLOAD.sales_agent_name);
});

test("ambiguous sales agent is rejected instead of selecting an arbitrary row", async () => {
  const repo = fakeRepository();
  repo.findSalesAgents = async () => [
    { id: 1, user_id: 1, full_name: "Інший агент", user_name: "Інший агент" },
    { id: 2, user_id: 2, full_name: "Ще один агент", user_name: "Ще один агент" },
  ];
  await assert.rejects(
    createTroIntegrationService(repo).created(USER, 125, CREATED_PAYLOAD),
    (error) => error.code === "AMBIGUOUS_SALES_AGENT",
  );
});

test("stage changes only integration stage and is idempotent", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const first = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "COMPLETED",
    changed_at: "2026-09-06T14:31:00+03:00",
  });
  const second = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "COMPLETED",
    changed_at: "2026-09-06T14:31:00+03:00",
  });
  assert.equal(first.portal_status, "PLANNED");
  assert.equal(repo.documents.get(125).status, "PLANNED");
  assert.equal(repo.documents.get(125).one_c_stage, "COMPLETED");
  assert.equal(second.idempotent, true);
  assert.equal(repo.history.filter((item) => item.action === "ONE_C_STAGE").length, 1);
});

test("rejected keeps the document and repeated identical request is idempotent", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.rejected(USER, 125, { reason: "Некоректні дані", reason_code: "DATA" });
  const repeated = await service.rejected(USER, 125, { reason: "Некоректні дані", reason_code: "DATA" });
  assert.equal(repo.documents.has(125), true);
  assert.equal(repo.deleted, false);
  assert.equal(repeated.idempotent, true);
  assert.equal(repo.history.length, 1);
});

function invoke(middleware, user) {
  let nextCalled = false;
  let statusCode = 200;
  let body;
  middleware(
    { user },
    { status(code) { statusCode = code; return this; }, json(value) { body = value; return value; } },
    () => { nextCalled = true; },
  );
  return { nextCalled, statusCode, body };
}

test("only configured integration account can use /api/1c and it is denied elsewhere", () => {
  const previous = process.env.ONE_C_INTEGRATION_LOGINS;
  process.env.ONE_C_INTEGRATION_LOGINS = "one_c_test";
  try {
    assert.equal(invoke(ensureOneCIntegrationAccount, USER).nextCalled, true);
    assert.equal(invoke(ensureOneCIntegrationAccount, { ...USER, userName: "ordinary" }).statusCode, 403);
    assert.equal(invoke(denyOneCIntegrationAccount, USER).statusCode, 403);
    assert.equal(invoke(denyOneCIntegrationAccount, { ...USER, userName: "ordinary" }).nextCalled, true);
  } finally {
    if (previous === undefined) delete process.env.ONE_C_INTEGRATION_LOGINS;
    else process.env.ONE_C_INTEGRATION_LOGINS = previous;
  }
});
