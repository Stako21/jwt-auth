import test from "node:test";
import assert from "node:assert/strict";
import { createTroIntegrationService, IntegrationError } from "../services/TroIntegrationService.js";
import { getTroPeople } from "../../client/src/components/Documents/troPeople.js";
import {
  denyOneCIntegrationAccount,
  ensureOneCIntegrationAccount,
  requireIntegrationCapability,
} from "../middlewares/oneCIntegrationAccount.js";

const USER = {
  principalType: "integration",
  integrationAccountId: 900,
  userName: "one_c_test",
  branchIds: [1],
  cityIds: [3],
  canProcessRequests: true,
  canSyncStatuses: true,
};
const CREATED_PAYLOAD = {
  portal_document_number: "ТРО-ZP-000125",
  document_1c_guid: "11111111-1111-4111-8111-111111111111",
  document_1c_number: "РП-005843",
  document_1c_date: "2026-09-06T12:15:35+03:00",
  responsible_guid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  responsible_name: "Администратор",
  sales_agent_guid: "22222222-2222-4222-8222-222222222222",
  sales_agent_name: "Іваненко Петро Іванович",
  source_system: "UP",
  warehouse_guid: null,
};
const REJECTED_PAYLOAD = {
  reason: "Некоректні дані торгової точки",
  reason_code: "TRADE_POINT_ERROR",
  responsible_guid: "44444444-4444-4444-8444-444444444444",
  responsible_name: "Администратор",
};

function document(overrides = {}) {
  return {
    id: 125,
    document_number: "ТРО-ZP-000125",
    document_type: "TRO",
    status: "NOT_COMPLETED",
    author_user_id: 10,
    branch_id: 1,
    city: 3,
    ta_user_id: 20,
    movement_type: "INSTALL",
    up_document_number: null,
    executor_name: null,
    document_1c_guid: null,
    document_1c_date: null,
    source_system: null,
    executor_guid: null,
    one_c_sales_agent_id: null,
    one_c_sales_agent_guid: null,
    one_c_sales_agent_name: null,
    warehouse_guid: null,
    one_c_stage: null,
    one_c_stage_updated_at: null,
    rejected_by_1c_guid: null,
    rejected_by_1c_name: null,
    created_at: "2026-09-06T09:00:00.000Z",
    updated_at: "2026-09-06T09:00:00.000Z",
    ...overrides,
  };
}

function compareCursorTuple(left, right) {
  const dateDifference = new Date(left.created_at).getTime() - new Date(right.createdAt).getTime();
  return dateDifference || Number(left.id) - Number(right.id);
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
    async getReadyCeiling({ branchIds, cityIds = [], movementType }) {
      const rows = [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id)
        && (!cityIds.length || cityIds.includes(item.city))
        && item.document_type === "TRO"
        && item.status === "NOT_COMPLETED"
        && (!movementType || item.movement_type === movementType))
        .sort((left, right) => compareCursorTuple(left, {
          createdAt: right.created_at,
          id: right.id,
        }));
      const last = rows.at(-1);
      return last ? { createdAt: last.created_at, id: last.id } : null;
    },
    async listReady({ branchIds, cityIds = [], movementType, after, ceiling, limit }) {
      return [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id)
        && (!cityIds.length || cityIds.includes(item.city))
        && item.document_type === "TRO"
        && item.status === "NOT_COMPLETED"
        && (!movementType || item.movement_type === movementType)
        && (!after || compareCursorTuple(item, after) > 0)
        && (!ceiling || compareCursorTuple(item, ceiling) <= 0))
        .sort((left, right) => compareCursorTuple(left, {
          createdAt: right.created_at,
          id: right.id,
        }))
        .slice(0, limit)
        .map((item) => ({
          ...item,
          comment: null,
          branch_name: "Філія", trade_point_guid: "tp", trade_point_name: "ТТ",
          city_id: item.city, city_name: "Черкаси",
          trade_point_address: "Адреса", contractor_guid: "co", contractor_name: "Контрагент",
          request_agent_guid: "agent", request_agent_name: "ТА заявки",
          request_sales_agent_id: item.request_sales_agent_id ?? null,
          request_agent_login: item.request_agent_login ?? null,
          request_route_guid: item.request_route_guid ?? null,
          request_route_name: item.request_route_name ?? null,
          request_assortment_guid: item.request_assortment_guid ?? null,
          request_assortment_name: item.request_assortment_name ?? null,
          request_agent_source: item.request_sales_agent_id ? "SNAPSHOT" : "LEGACY",
        }));
    },
    async getItems() { return []; },
    async getPendingCeiling({ branchIds, cityIds = [] }) {
      const rows = [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id) && item.document_1c_guid
        && (!cityIds.length || cityIds.includes(item.city))
        && item.status !== "REJECTED" && [null, "NEW", "IN_PROGRESS"].includes(item.one_c_stage))
        .sort((left, right) => compareCursorTuple(left, {
          createdAt: right.created_at,
          id: right.id,
        }));
      const last = rows.at(-1);
      return last ? { createdAt: last.created_at, id: last.id } : null;
    },
    async listPending({ branchIds, cityIds = [], after, ceiling, limit }) {
      return [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id) && item.document_1c_guid
        && (!cityIds.length || cityIds.includes(item.city))
        && item.status !== "REJECTED" && [null, "NEW", "IN_PROGRESS"].includes(item.one_c_stage)
        && (!after || compareCursorTuple(item, after) > 0)
        && (!ceiling || compareCursorTuple(item, ceiling) <= 0))
        .sort((left, right) => compareCursorTuple(left, {
          createdAt: right.created_at,
          id: right.id,
        }))
        .slice(0, limit)
        .map((item) => ({ ...item, cursor_created_at: item.created_at }));
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
        executor_name: values.responsibleName,
        executor_guid: values.responsibleGuid,
        one_c_sales_agent_id: values.salesAgentId,
        one_c_sales_agent_guid: values.salesAgentGuid,
        one_c_sales_agent_name: values.salesAgentName,
        warehouse_guid: values.warehouseGuid,
        one_c_stage: "NEW",
        status: item.status === "NOT_COMPLETED" ? "PLANNED" : item.status,
      });
    },
    async updateCreatedMetadata(_connection, values) {
      const item = documents.get(values.documentId);
      Object.assign(item, {
        executor_name: values.responsibleName,
        executor_guid: values.responsibleGuid,
        one_c_sales_agent_id: values.salesAgentId,
        one_c_sales_agent_guid: values.salesAgentGuid,
        one_c_sales_agent_name: values.salesAgentName,
      });
    },
    async saveStage(_connection, id, stage, changedAt) {
      Object.assign(documents.get(id), { one_c_stage: stage, one_c_stage_updated_at: changedAt });
    },
    async savePortalStatus(_connection, id, status) {
      Object.assign(documents.get(id), { status });
    },
    async reject(_connection, values) {
      Object.assign(documents.get(values.documentId), {
        status: "REJECTED",
        rejected_by_1c_guid: values.responsibleGuid,
        rejected_by_1c_name: values.responsibleName,
      });
    },
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
  assert.deepEqual(result.data.map((item) => item.portal_document_id), [125]);
  assert.equal(result.data[0].status, "NOT_COMPLETED");
  assert.deepEqual(result.data[0].city, { id: 3, name: "Черкаси" });
  assert.deepEqual(result.pagination, { next_cursor: null, has_more: false });
});

test("integration city scope filters queues and protects callbacks", async () => {
  const foreign = document({ id: 126, city: 4, document_number: "ТРО-DP-000126" });
  const repo = fakeRepository([document(), foreign]);
  const service = createTroIntegrationService(repo);
  const ready = await service.listReady(USER);
  assert.deepEqual(ready.data.map((item) => item.portal_document_id), [125]);
  await assert.rejects(
    service.created(USER, 126, { ...CREATED_PAYLOAD, portal_document_number: foreign.document_number }),
    (error) => error instanceof IntegrationError && error.status === 403 && error.code === "CITY_ACCESS_DENIED",
  );
});

test("GET returns immutable request position snapshots for new-model TRO", async () => {
  const repo = fakeRepository([document({
    request_sales_agent_id: 3385,
    request_agent_login: "UA013-0059",
    request_route_guid: "42b1adba-23a0-41f1-bb23-c210c7f2a6f7",
    request_route_name: "Маршрут Lacmi",
    request_assortment_guid: "d3dd4f7f-3c44-41e1-ae17-002618a12e97",
    request_assortment_name: "Lacmi",
  })]);
  const [item] = (await createTroIntegrationService(repo).listReady(USER)).data;
  assert.deepEqual(item.request_sales_agent, {
    id: 3385,
    guid: "agent",
    name: "ТА заявки",
    login: "UA013-0059",
    route_guid: "42b1adba-23a0-41f1-bb23-c210c7f2a6f7",
    route_name: "Маршрут Lacmi",
    assortment_guid: "d3dd4f7f-3c44-41e1-ae17-002618a12e97",
    assortment_name: "Lacmi",
    source: "SNAPSHOT",
  });
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
  assert.equal(saved.executor_name, CREATED_PAYLOAD.responsible_name);
  assert.equal(saved.executor_guid, CREATED_PAYLOAD.responsible_guid);
  assert.notEqual(saved.executor_name, CREATED_PAYLOAD.sales_agent_name);
  assert.equal(saved.one_c_sales_agent_id, 77);
  assert.equal(saved.one_c_sales_agent_guid, CREATED_PAYLOAD.sales_agent_guid);
  assert.equal(saved.one_c_sales_agent_name, CREATED_PAYLOAD.sales_agent_name);
  assert.equal(saved.document_1c_guid, CREATED_PAYLOAD.document_1c_guid);
  assert.equal(repo.history.length, 1);
  assert.match(repo.history[0].comment, /Виконавець: Администратор/);
  assert.match(repo.history[0].comment, /ТА: Іваненко Петро Іванович/);
});

test("repeated created updates integration metadata without workflow rollback or duplicate history", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const authorId = repo.documents.get(125).author_user_id;
  const taUserId = repo.documents.get(125).ta_user_id;
  repo.documents.get(125).status = "COMPLETED";
  const metadataUpdate = {
    ...CREATED_PAYLOAD,
    responsible_guid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    responsible_name: "Новий відповідальний",
    sales_agent_guid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    sales_agent_name: "Новий торговий агент",
  };
  const result = await service.created(USER, 125, metadataUpdate);
  const saved = repo.documents.get(125);
  assert.equal(result.idempotent, true);
  assert.equal(saved.status, "COMPLETED");
  assert.equal(saved.author_user_id, authorId);
  assert.equal(saved.ta_user_id, taUserId);
  assert.equal(saved.executor_name, metadataUpdate.responsible_name);
  assert.equal(saved.executor_guid, metadataUpdate.responsible_guid);
  assert.equal(saved.one_c_sales_agent_id, 77);
  assert.equal(saved.one_c_sales_agent_guid, metadataUpdate.sales_agent_guid);
  assert.equal(saved.one_c_sales_agent_name, metadataUpdate.sales_agent_name);
  assert.equal(repo.history.length, 1);
});

test("created requires responsible GUID and name", async () => {
  const service = createTroIntegrationService(fakeRepository());
  await assert.rejects(
    service.created(USER, 125, { ...CREATED_PAYLOAD, responsible_guid: "" }),
    (error) => error instanceof IntegrationError && error.status === 422,
  );
  await assert.rejects(
    service.created(USER, 125, { ...CREATED_PAYLOAD, responsible_name: "" }),
    (error) => error instanceof IntegrationError && error.status === 422,
  );
});

test("frontend presents 1C responsible and sales agent separately", () => {
  assert.deepEqual(getTroPeople({
    executorName: "Администратор",
    oneCSalesAgentName: "Гудим Наталія Володимирівна",
    requestSalesAgentName: "ТА заявки",
  }), {
    executorName: "Администратор",
    salesAgentName: "Гудим Наталія Володимирівна",
    isRequestSalesAgent: false,
  });
  assert.deepEqual(getTroPeople({ requestSalesAgentName: "ТА заявки" }), {
    executorName: "—",
    salesAgentName: "ТА заявки",
    isRequestSalesAgent: true,
  });
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
  assert.equal(repo.documents.get(125).one_c_sales_agent_id, null);
  assert.equal(repo.documents.get(125).one_c_sales_agent_name, CREATED_PAYLOAD.sales_agent_name);
  assert.equal(repo.documents.get(125).executor_name, CREATED_PAYLOAD.responsible_name);
});

test("created accepts optional route identity and passes it to actual-position resolver", async () => {
  const repo = fakeRepository();
  let receivedIdentity;
  repo.findSalesAgents = async (_connection, _branchId, _guid, identity) => {
    receivedIdentity = identity;
    return [{ id: 88, full_name: CREATED_PAYLOAD.sales_agent_name }];
  };
  await createTroIntegrationService(repo).created(USER, 125, {
    ...CREATED_PAYLOAD,
    sales_agent_login: "UA013-0059",
    sales_agent_route_guid: "42b1adba-23a0-41f1-bb23-c210c7f2a6f7",
    sales_agent_assortment_guid: "d3dd4f7f-3c44-41e1-ae17-002618a12e97",
  });
  assert.deepEqual(receivedIdentity, {
    login: "ua013-0059",
    routeGuid: "42b1adba-23a0-41f1-bb23-c210c7f2a6f7",
    assortmentGuid: "d3dd4f7f-3c44-41e1-ae17-002618a12e97",
  });
  assert.equal(repo.documents.get(125).one_c_sales_agent_id, 88);
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

test("CANCELLED after IN_PROGRESS also rejects the portal request", async () => {
  const repo = fakeRepository();
  const notifications = [];
  const service = createTroIntegrationService(
    repo,
    async (...args) => notifications.push(args),
  );
  await service.created(USER, 125, CREATED_PAYLOAD);
  notifications.length = 0;
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "IN_PROGRESS",
    changed_at: "2026-09-06T14:31:00+03:00",
  });

  const cancelled = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "CANCELLED",
    changed_at: "2026-09-06T15:31:00+03:00",
  });
  const repeated = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "CANCELLED",
    changed_at: "2026-09-06T15:31:00+03:00",
  });

  assert.deepEqual(cancelled, {
    idempotent: false,
    portal_status: "REJECTED",
    one_c_stage: "CANCELLED",
  });
  assert.equal(repo.documents.get(125).status, "REJECTED");
  assert.equal(repo.documents.get(125).one_c_stage, "CANCELLED");
  assert.equal(repeated.idempotent, true);
  assert.equal(repo.history.filter((item) => item.action === "ONE_C_STAGE").length, 2);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0].slice(1), [125, "PLANNED", "REJECTED"]);
  assert.equal(notifications[0][0].role, 1);
  assert.equal(notifications[0][0].branchId, 1);
});

test("repeated CANCELLED repairs a portal request that was not cancelled", async () => {
  const repo = fakeRepository([document({
    status: "PLANNED",
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    one_c_stage: "CANCELLED",
    one_c_stage_updated_at: new Date("2026-09-06T12:31:00Z"),
  })]);
  const result = await createTroIntegrationService(repo).stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "CANCELLED",
    changed_at: "2026-09-06T15:31:00+03:00",
  });

  assert.equal(result.idempotent, false);
  assert.equal(result.portal_status, "REJECTED");
  assert.equal(repo.documents.get(125).status, "REJECTED");
  assert.equal(repo.history.at(-1).oldStatus, "PLANNED");
  assert.equal(repo.history.at(-1).newStatus, "REJECTED");
});

test("rejected keeps the document and repeated identical request is idempotent", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  const before = {
    author: repo.documents.get(125).author_user_id,
    ta: repo.documents.get(125).ta_user_id,
  };
  const first = await service.rejected(USER, 125, REJECTED_PAYLOAD);
  const repeated = await service.rejected(USER, 125, REJECTED_PAYLOAD);
  const saved = repo.documents.get(125);
  assert.equal(repo.documents.has(125), true);
  assert.equal(repo.deleted, false);
  assert.equal(first.idempotent, false);
  assert.equal(repeated.idempotent, true);
  assert.equal(saved.rejected_by_1c_guid, REJECTED_PAYLOAD.responsible_guid);
  assert.equal(saved.rejected_by_1c_name, REJECTED_PAYLOAD.responsible_name);
  assert.equal(saved.author_user_id, before.author);
  assert.equal(saved.ta_user_id, before.ta);
  assert.equal(saved.executor_name, null);
  assert.equal(repo.history.length, 1);
  assert.equal(repo.history[0].userId, null);
  assert.equal(
    repo.history[0].comment,
    "Заявку відхилено в УП.\nВідповідальний: Администратор.\nПричина: Некоректні дані торгової точки.\nКод причини: TRADE_POINT_ERROR.",
  );
});

test("rejected requires a valid responsible GUID and non-empty responsible name", async () => {
  const service = createTroIntegrationService(fakeRepository());
  await assert.rejects(
    service.rejected(USER, 125, { ...REJECTED_PAYLOAD, responsible_guid: "" }),
    (error) => error instanceof IntegrationError && error.status === 422 && error.code === "INVALID_GUID",
  );
  await assert.rejects(
    service.rejected(USER, 125, { ...REJECTED_PAYLOAD, responsible_name: "   " }),
    (error) => error instanceof IntegrationError
      && error.status === 422
      && error.code === "RESPONSIBLE_NAME_REQUIRED",
  );
  await assert.rejects(
    service.rejected(USER, 125, { ...REJECTED_PAYLOAD, responsible_name: "x".repeat(151) }),
    (error) => error instanceof IntegrationError && error.status === 422 && error.code === "VALUE_TOO_LONG",
  );
});

test("rejected conflict cannot overwrite the first reason or responsible snapshot", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.rejected(USER, 125, REJECTED_PAYLOAD);

  for (const changed of [
    { reason: "Інша причина" },
    { reason_code: "OTHER_ERROR" },
    { responsible_guid: "55555555-5555-4555-8555-555555555555" },
    { responsible_name: "Інший відповідальний" },
  ]) {
    await assert.rejects(
      service.rejected(USER, 125, { ...REJECTED_PAYLOAD, ...changed }),
      (error) => error instanceof IntegrationError
        && error.status === 409
        && error.code === "DOCUMENT_ALREADY_REJECTED",
    );
  }

  assert.equal(repo.documents.get(125).rejected_by_1c_guid, REJECTED_PAYLOAD.responsible_guid);
  assert.equal(repo.documents.get(125).rejected_by_1c_name, REJECTED_PAYLOAD.responsible_name);
  assert.equal(repo.history.length, 1);
});

function paginationDocuments(kind, count = 5) {
  return Array.from({ length: count }, (_, index) => document({
    id: 201 + index,
    document_number: `TRO-ZP-${String(201 + index).padStart(6, "0")}`,
    created_at: "2026-09-06T10:00:00.000Z",
    updated_at: "2026-09-06T10:00:00.000Z",
    status: kind === "pending" ? "PLANNED" : "NOT_COMPLETED",
    document_1c_guid: kind === "pending" ? `external-${201 + index}` : null,
    source_system: kind === "pending" ? "UP" : null,
    one_c_stage: kind === "pending" ? "NEW" : null,
  }));
}

function paginationSubject(kind, count = 5) {
  const repo = fakeRepository(paginationDocuments(kind, count));
  const service = createTroIntegrationService(repo, async () => {}, { cursorSecret: "test-cursor-secret" });
  const load = (query = {}) => kind === "ready"
    ? service.listReady(USER, query)
    : service.listPending(USER, query);
  return { repo, load };
}

for (const kind of ["ready", "pending"]) {
  test(`${kind} cursor pagination returns the first page`, async () => {
    const { load } = paginationSubject(kind);
    const result = await load({ limit: 2 });
    assert.deepEqual(result.data.map((item) => item.portal_document_id), [201, 202]);
    assert.equal(result.pagination.has_more, true);
    assert.equal(typeof result.pagination.next_cursor, "string");
  });

  test(`${kind} cursor pagination returns the next page`, async () => {
    const { load } = paginationSubject(kind);
    const first = await load({ limit: 2 });
    const second = await load({ limit: 2, cursor: first.pagination.next_cursor });
    assert.deepEqual(second.data.map((item) => item.portal_document_id), [203, 204]);
    assert.equal(second.pagination.has_more, true);
  });

  test(`${kind} cursor pagination marks the last page`, async () => {
    const { load } = paginationSubject(kind);
    const first = await load({ limit: 2 });
    const second = await load({ limit: 2, cursor: first.pagination.next_cursor });
    const last = await load({ limit: 2, cursor: second.pagination.next_cursor });
    assert.deepEqual(last.data.map((item) => item.portal_document_id), [205]);
    assert.deepEqual(last.pagination, { next_cursor: null, has_more: false });
  });

  test(`${kind} cursor pagination has no duplicates between pages`, async () => {
    const { load } = paginationSubject(kind);
    const ids = [];
    let cursor;
    do {
      const result = await load({ limit: 2, ...(cursor ? { cursor } : {}) });
      ids.push(...result.data.map((item) => item.portal_document_id));
      cursor = result.pagination.next_cursor;
    } while (cursor);
    assert.deepEqual(ids, [201, 202, 203, 204, 205]);
    assert.equal(new Set(ids).size, ids.length);
  });

  test(`${kind} cursor pagination is stable when timestamps are identical`, async () => {
    const { load } = paginationSubject(kind);
    const first = await load({ limit: 3 });
    const second = await load({ limit: 3, cursor: first.pagination.next_cursor });
    assert.deepEqual(
      [...first.data, ...second.data].map((item) => item.portal_document_id),
      [201, 202, 203, 204, 205],
    );
  });

  test(`${kind} cursor pagination rejects an invalid cursor with 422`, async () => {
    const { load } = paginationSubject(kind);
    await assert.rejects(
      load({ limit: 2, cursor: "invalid-cursor" }),
      (error) => error instanceof IntegrationError
        && error.status === 422
        && error.code === "INVALID_CURSOR",
    );
  });

  test(`${kind} request without cursor remains compatible`, async () => {
    const { load } = paginationSubject(kind, 1);
    const result = await load();
    assert.equal(Array.isArray(result.data), true);
    assert.equal(result.data.length, 1);
    assert.deepEqual(result.pagination, { next_cursor: null, has_more: false });
  });
}

test("new documents do not extend an active cursor traversal", async () => {
  const { repo, load } = paginationSubject("ready", 3);
  const first = await load({ limit: 2 });
  repo.documents.set(999, document({
    id: 999,
    document_number: "TRO-ZP-000999",
    created_at: "2026-09-06T11:00:00.000Z",
    updated_at: "2026-09-06T11:00:00.000Z",
  }));
  const last = await load({ limit: 2, cursor: first.pagination.next_cursor });
  assert.deepEqual(last.data.map((item) => item.portal_document_id), [203]);
  assert.deepEqual(last.pagination, { next_cursor: null, has_more: false });
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

test("integration principals can use /api/1c and are denied ordinary APIs", () => {
  assert.equal(invoke(ensureOneCIntegrationAccount, USER).nextCalled, true);
  assert.equal(invoke(ensureOneCIntegrationAccount, { userName: "ordinary" }).statusCode, 403);
  assert.equal(invoke(denyOneCIntegrationAccount, USER).statusCode, 403);
  assert.equal(invoke(denyOneCIntegrationAccount, { userName: "ordinary" }).nextCalled, true);
});

test("integration capabilities separate request processing from status sync", () => {
  const requestOnly = { ...USER, canProcessRequests: true, canSyncStatuses: false };
  assert.equal(invoke(requireIntegrationCapability("canProcessRequests"), requestOnly).nextCalled, true);
  assert.equal(invoke(requireIntegrationCapability("canSyncStatuses"), requestOnly).statusCode, 403);
});
