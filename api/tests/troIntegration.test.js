import test from "node:test";
import assert from "node:assert/strict";
import { createTroIntegrationService, IntegrationError } from "../services/TroIntegrationService.js";
import TroIntegrationRepository from "../repositories/TroIntegration.js";
import { isTroNaturallyStatusPending } from "../utils/troStatusSync.js";
import { getTroPeople } from "../../client/src/components/Documents/troPeople.js";
import { getExecutionDocumentStatus } from "../../client/src/components/Documents/executionDocumentStatus.js";
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
const EXECUTION_DOCUMENTS = [
  {
    document_1c_guid: "55555555-5555-4555-8555-555555555555",
    document_number: "СГ0003111",
    document_date: "2026-09-08T10:27:29+03:00",
    confirmed: true,
    shipped_from_warehouse: true,
  },
  {
    document_1c_guid: "66666666-6666-4666-8666-666666666666",
    document_number: "СГ0003110",
    document_date: "2026-09-08T10:27:31+03:00",
    confirmed: false,
    shipped_from_warehouse: true,
  },
];

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
    one_c_observed_at: null,
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
  const executionDocuments = new Map();
  const history = [];
  let deleted = false;
  let executionWrites = 0;
  return {
    documents,
    executionDocuments,
    history,
    get executionWrites() { return executionWrites; },
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
        && (item.status_sync_requested_at || isTroNaturallyStatusPending(item, (executionDocuments.get(item.id) || []).length > 0)))
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
        && (item.status_sync_requested_at || isTroNaturallyStatusPending(item, (executionDocuments.get(item.id) || []).length > 0))
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
    async lockDocument(_connection, id) {
      const item = documents.get(Number(id));
      return item ? { ...item } : null;
    },
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
    async getExecutionDocuments(_connection, id) {
      return (executionDocuments.get(id) || []).map((item, index) => ({
        id: index + 1,
        portal_document_id: id,
        source_system: item.sourceSystem,
        document_1c_guid: item.documentGuid,
        document_number: item.documentNumber,
        document_date: item.documentDate,
        confirmed: item.confirmed,
        shipped_from_warehouse: item.shippedFromWarehouse,
      }));
    },
    async findExecutionDocumentConflicts(_connection, sourceSystem, guids, documentId) {
      const conflicts = [];
      for (const [ownerId, rows] of executionDocuments.entries()) {
        if (ownerId === documentId) continue;
        for (const row of rows) {
          if (row.sourceSystem === sourceSystem && guids.includes(row.documentGuid)) {
            conflicts.push({ document_1c_guid: row.documentGuid, portal_document_id: ownerId });
          }
        }
      }
      return conflicts;
    },
    async syncExecutionDocuments(_connection, id, sourceSystem, rows) {
      executionWrites += 1;
      executionDocuments.set(id, rows.map((item) => ({ ...item, sourceSystem })));
    },
    async saveStageObservation(_connection, id, stage, changedAt, stageChanged) {
      const item = documents.get(id);
      if (stageChanged) {
        item.one_c_stage = stage;
        item.one_c_stage_updated_at = changedAt;
      }
      item.one_c_observed_at = changedAt;
    },
    async acknowledgeStatusSyncRequest(_connection, id) {
      documents.get(id).status_sync_requested_at = null;
    },
    async reject(_connection, values) {
      Object.assign(documents.get(values.documentId), {
        status: "REJECTED",
        rejected_by_1c_guid: values.responsibleGuid,
        rejected_by_1c_name: values.responsibleName,
      });
    },
    async cancelPlanned(_connection, id, branchId) {
      const item = documents.get(id);
      assert.equal(item.branch_id, branchId);
      assert.equal(item.status, "PLANNED");
      item.status = "CANCELLED";
    },
    async addHistory(_connection, entry) { history.push(entry); },
    async getLastHistoryComment(_connection, id, action) {
      return [...history].reverse().find((item) => item.documentId === id && item.action === action)?.comment ?? null;
    },
    async delete() { deleted = true; },
  };
}

test("late UP stage and idempotent created callbacks cannot undo administrative cancellation", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  repo.documents.get(125).status = "CANCELLED";
  const historyBefore = repo.history.length;
  const created = await service.created(USER, 125, CREATED_PAYLOAD);
  assert.equal(created.idempotent, true);
  assert.equal(created.portal_status, "CANCELLED");
  assert.equal(repo.history.length, historyBefore);
  for (const [index, stage] of ["IN_PROGRESS", "COMPLETED", "CANCELLED"].entries()) {
    const result = await service.stage(USER, 125, {
      document_1c_guid: CREATED_PAYLOAD.document_1c_guid, source_system: "UP",
      stage, changed_at: `2026-10-22T10:3${index}:00+03:00`,
      execution_documents: stage === "CANCELLED" ? [] : EXECUTION_DOCUMENTS,
    });
    assert.equal(result.portal_status, "CANCELLED");
    assert.equal(repo.documents.get(125).status, "CANCELLED");
  }
  await assert.rejects(service.rejected(USER, 125, REJECTED_PAYLOAD), { code: "DOCUMENT_ALREADY_LINKED" });
  assert.equal(repo.documents.get(125).status, "CANCELLED");
  assert.equal(repo.history.some((item) => item.action === "ONE_C_CANCELLED"), false);
});

test("ready traversal and late first created callback cannot process a withdrawn or cancelled request", async () => {
  for (const status of ["REVISION", "CANCELLED"]) {
    const repo = fakeRepository([document({ status })]);
    const service = createTroIntegrationService(repo);
    assert.equal((await service.listReady(USER)).data.length, 0);
    await assert.rejects(service.created(USER, 125, CREATED_PAYLOAD), { code: "INVALID_PORTAL_STATUS" });
    assert.equal(repo.documents.get(125).status, status);
    assert.equal(repo.documents.get(125).document_1c_guid, null);
    assert.equal(repo.history.length, 0);
  }
});

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

test("frontend execution status gives confirmation precedence over shipment", () => {
  assert.equal(getExecutionDocumentStatus({ confirmed: true, shipped_from_warehouse: true }).label, "Підтверджено");
  assert.equal(getExecutionDocumentStatus({ confirmed: false, shipped_from_warehouse: true }).label, "Відвантажено зі складу");
  assert.equal(getExecutionDocumentStatus({ confirmed: false, shipped_from_warehouse: false }).label, "Не підтверджено");
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

test("stage atomically stores multiple execution documents and exact retry does not write", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const payload = {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: EXECUTION_DOCUMENTS,
  };
  const first = await service.stage(USER, 125, payload);
  const writesAfterFirst = repo.executionWrites;
  const historyAfterFirst = repo.history.length;
  const repeated = await service.stage(USER, 125, payload);

  assert.equal(repo.executionDocuments.get(125).length, 2);
  assert.equal(first.stage_changed, true);
  assert.equal(first.execution_documents_changed, true);
  assert.equal(repeated.idempotent, true);
  assert.equal(repo.executionWrites, writesAfterFirst);
  assert.equal(repo.history.length, historyAfterFirst);
});

test("execution snapshot updates and removes missing rows without fake stage history", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: EXECUTION_DOCUMENTS,
  });
  const historyBefore = repo.history.length;
  const result = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:31:00+03:00",
    execution_documents: [{ ...EXECUTION_DOCUMENTS[1], confirmed: true }],
  });

  assert.equal(result.stage_changed, false);
  assert.equal(result.execution_documents_changed, true);
  assert.equal(repo.executionDocuments.get(125).length, 1);
  assert.equal(repo.executionDocuments.get(125)[0].confirmed, true);
  assert.equal(repo.history.length, historyBefore);
});

test("authoritative empty execution snapshot clears rows", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: EXECUTION_DOCUMENTS,
  });
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:31:00+03:00",
    execution_documents: [],
  });
  assert.deepEqual(repo.executionDocuments.get(125), []);
});

test("legacy stage payload without execution_documents preserves stored rows", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: EXECUTION_DOCUMENTS,
  });
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "COMPLETED",
    changed_at: "2026-09-08T10:31:00+03:00",
  });
  assert.equal(repo.executionDocuments.get(125).length, 2);
});

test("execution snapshot validates arrays, unique GUIDs and boolean flags", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const base = {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
  };
  await assert.rejects(service.stage(USER, 125, {
    ...base, execution_documents: {},
  }), (error) => error.status === 422 && error.code === "INVALID_EXECUTION_DOCUMENTS");
  await assert.rejects(service.stage(USER, 125, {
    ...base, execution_documents: [EXECUTION_DOCUMENTS[0], EXECUTION_DOCUMENTS[0]],
  }), (error) => error.status === 422 && error.code === "DUPLICATE_EXECUTION_DOCUMENT_GUID");
  await assert.rejects(service.stage(USER, 125, {
    ...base,
    execution_documents: [{ ...EXECUTION_DOCUMENTS[0], confirmed: "true" }],
  }), (error) => error.status === 422 && error.code === "INVALID_EXECUTION_DOCUMENT_FLAGS");
});

test("execution snapshot rejects stale observations and cross-request GUID conflicts", async () => {
  const repo = fakeRepository([document(), document({
    id: 126,
    document_number: "ТРО-ZP-000126",
    document_1c_guid: "77777777-7777-4777-8777-777777777777",
    source_system: "UP",
    one_c_stage: "IN_PROGRESS",
  })]);
  repo.executionDocuments.set(126, [{
    sourceSystem: "UP",
    documentGuid: EXECUTION_DOCUMENTS[0].document_1c_guid,
    documentNumber: "СГ0003111",
    documentDate: new Date(EXECUTION_DOCUMENTS[0].document_date),
    confirmed: true,
    shippedFromWarehouse: true,
  }]);
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  await assert.rejects(service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: [EXECUTION_DOCUMENTS[0]],
  }), (error) => error.code === "EXECUTION_DOCUMENT_GUID_CONFLICT");

  repo.executionDocuments.delete(126);
  await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: EXECUTION_DOCUMENTS,
  });
  await assert.rejects(service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:29:59+03:00",
    execution_documents: [],
  }), (error) => error.code === "STALE_STAGE_UPDATE");
});

test("COMPLETED with execution snapshot does not complete Portal workflow", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const result = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "COMPLETED",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: [{ ...EXECUTION_DOCUMENTS[0], confirmed: true }],
  });
  assert.equal(result.one_c_stage, "COMPLETED");
  assert.equal(result.portal_status, "PLANNED");
  assert.equal(repo.documents.get(125).status, "PLANNED");
  assert.equal(repo.executionDocuments.get(125).length, 1);
});

test("CANCELLED after IN_PROGRESS changes only 1C stage and keeps execution snapshot atomic", async () => {
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
    execution_documents: EXECUTION_DOCUMENTS,
  });
  const repeated = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP",
    stage: "CANCELLED",
    changed_at: "2026-09-06T15:31:00+03:00",
    execution_documents: EXECUTION_DOCUMENTS,
  });

  assert.deepEqual(cancelled, {
    idempotent: false,
    stage_changed: true,
    execution_documents_changed: true,
    portal_status: "PLANNED",
    one_c_stage: "CANCELLED",
  });
  assert.equal(repo.documents.get(125).status, "PLANNED");
  assert.equal(repo.documents.get(125).one_c_stage, "CANCELLED");
  assert.equal(repo.executionDocuments.get(125).length, 2);
  assert.equal(repeated.idempotent, true);
  assert.equal(repo.history.filter((item) => item.action === "ONE_C_STAGE").length, 2);
  const cancellationHistory = repo.history.at(-1);
  assert.equal(cancellationHistory.oldStatus, null);
  assert.equal(cancellationHistory.newStatus, null);
  assert.equal(notifications.length, 0);
});

test("legacy CANCELLED without a full execution snapshot never cancels Portal business status", async () => {
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

  assert.equal(result.idempotent, true);
  assert.equal(result.portal_status, "PLANNED");
  assert.equal(repo.documents.get(125).status, "PLANNED");
  assert.equal(repo.history.length, 0);
});

test("cancelled parent with any active execution stays planned and pending until the full snapshot is empty", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const initial = { ...repo.documents.get(125) };
  const payload = {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "CANCELLED",
    changed_at: "2026-09-08T10:30:00+03:00",
    execution_documents: [EXECUTION_DOCUMENTS[0]], // Even one confirmed document blocks cancellation.
  };
  const conflict = await service.stage(USER, 125, payload);
  assert.equal(conflict.portal_status, "PLANNED");
  assert.equal(repo.executionDocuments.get(125).length, 1);
  assert.deepEqual((await service.listPending(USER)).data.map((row) => row.portal_document_id), [125]);

  // Same 1C stage: removal of the final execution must still finalize the Portal request.
  const finalPayload = { ...payload, changed_at: "2026-09-08T10:31:00+03:00", execution_documents: [] };
  const final = await service.stage(USER, 125, finalPayload);
  assert.equal(final.portal_status, "CANCELLED");
  assert.equal(final.stage_changed, false);
  assert.equal(repo.documents.get(125).status, "CANCELLED");
  assert.equal(repo.executionDocuments.get(125).length, 0);
  assert.equal((await service.listPending(USER)).data.length, 0);
  const historyCount = repo.history.length;
  const retry = await service.stage(USER, 125, finalPayload);
  assert.equal(retry.idempotent, true);
  assert.equal(repo.history.length, historyCount);
  assert.deepEqual(repo.history.filter((row) => row.action === "ONE_C_CANCELLED"), [{
    documentId: 125, userId: null, action: "ONE_C_CANCELLED",
    oldStatus: "PLANNED", newStatus: "CANCELLED",
    comment: "Заявку скасовано в УП. Повний знімок 1С підтвердив відсутність активних документів виконання.",
  }]);
  for (const field of ["document_1c_guid", "author_user_id", "ta_user_id", "up_document_number", "executor_guid"]) {
    assert.equal(repo.documents.get(125)[field], initial[field]);
  }
});

test("both INSTALL and RETURN cancel directly only with an authoritative empty snapshot", async () => {
  for (const movement_type of ["INSTALL", "RETURN"]) {
    const repo = fakeRepository([document({ movement_type })]);
    const service = createTroIntegrationService(repo);
    await service.created(USER, 125, CREATED_PAYLOAD);
    const result = await service.stage(USER, 125, {
      document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
      source_system: "UP", stage: "CANCELLED",
      changed_at: "2026-09-08T10:30:00+03:00", execution_documents: [],
    });
    assert.equal(result.portal_status, "CANCELLED");
    assert.equal(repo.history.filter((row) => row.action === "ONE_C_CANCELLED").length, 1);
  }
});

test("restoring a cancelled parent resumes normal polling and keeps its execution snapshot", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const payload = {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "CANCELLED",
    changed_at: "2026-09-08T10:30:00+03:00", execution_documents: EXECUTION_DOCUMENTS,
  };
  await service.stage(USER, 125, payload);
  const restored = await service.stage(USER, 125, {
    ...payload, stage: "IN_PROGRESS", changed_at: "2026-09-08T10:31:00+03:00",
  });
  assert.equal(restored.portal_status, "PLANNED");
  assert.equal(restored.one_c_stage, "IN_PROGRESS");
  assert.equal(repo.executionDocuments.get(125).length, 2);
  assert.equal((await service.listPending(USER)).data.length, 1);
  assert.equal(repo.history.filter((row) => row.action === "ONE_C_CANCELLED").length, 0);
});

test("legacy CANCELLED keeps stored executions and stays in the synchronization queue", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const payload = {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "IN_PROGRESS",
    changed_at: "2026-09-08T10:30:00+03:00", execution_documents: EXECUTION_DOCUMENTS,
  };
  await service.stage(USER, 125, payload);
  const { execution_documents: _snapshot, ...legacy } = payload;
  await service.stage(USER, 125, { ...legacy, stage: "CANCELLED", changed_at: "2026-09-08T10:31:00+03:00" });
  assert.equal(repo.documents.get(125).status, "PLANNED");
  assert.equal(repo.executionDocuments.get(125).length, 2);
  assert.equal((await service.listPending(USER)).data.length, 1);
});

test("previously cancelled planned requests with no stored executions are polled for confirmation", async () => {
  const repo = fakeRepository([document({
    status: "PLANNED", one_c_stage: "CANCELLED", source_system: "UP",
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    one_c_stage_updated_at: new Date("2026-09-08T07:30:00Z"),
    one_c_observed_at: new Date("2026-09-08T07:30:00Z"),
  })]);
  const service = createTroIntegrationService(repo);
  assert.equal((await service.listPending(USER)).data.length, 1);
  const result = await service.stage(USER, 125, {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid, source_system: "UP",
    stage: "CANCELLED", changed_at: "2026-09-08T10:30:00+03:00", execution_documents: [],
  });
  assert.equal(result.idempotent, false);
  assert.equal(result.stage_changed, false);
  assert.equal(result.portal_status, "CANCELLED");
  assert.equal((await service.listPending(USER)).data.length, 0);
});

test("stale cancellation cannot clear active executions or finalize the Portal request", async () => {
  const repo = fakeRepository();
  const service = createTroIntegrationService(repo);
  await service.created(USER, 125, CREATED_PAYLOAD);
  const payload = {
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    source_system: "UP", stage: "CANCELLED",
    changed_at: "2026-09-08T10:30:00+03:00", execution_documents: EXECUTION_DOCUMENTS,
  };
  await service.stage(USER, 125, payload);
  await assert.rejects(service.stage(USER, 125, {
    ...payload, changed_at: "2026-09-08T10:29:59+03:00", execution_documents: [],
  }), (error) => error.code === "STALE_STAGE_UPDATE");
  assert.equal(repo.documents.get(125).status, "PLANNED");
  assert.equal(repo.executionDocuments.get(125).length, 2);
});

test("cancellation preserves completed and other non-planned Portal statuses", async () => {
  for (const status of ["COMPLETED", "REJECTED", "NEW", "NOT_COMPLETED", "REVISION"]) {
    const repo = fakeRepository([document({
      status, one_c_stage: "IN_PROGRESS", source_system: "UP",
      document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    })]);
    const result = await createTroIntegrationService(repo).stage(USER, 125, {
      document_1c_guid: CREATED_PAYLOAD.document_1c_guid, source_system: "UP",
      stage: "CANCELLED", changed_at: "2026-09-08T10:30:00+03:00", execution_documents: [],
    });
    assert.equal(result.portal_status, status);
    assert.equal(repo.documents.get(125).status, status);
  }
});

test("pending SQL keeps cancelled conflicts under the same branch/city and cursor boundaries", () => {
  const { where, params } = TroIntegrationRepository.buildPendingWhere({
    branchIds: [1, 2], cityIds: [3],
    after: { createdAt: "2026-09-08T07:30:00Z", id: 4 },
    ceiling: { createdAt: "2026-09-08T07:31:00Z", id: 9 },
  });
  const sql = where.join(" AND ");
  assert.match(sql, /d\.branch_id IN \(\?, \?\)/);
  assert.match(sql, /d\.city IN \(\?\)/);
  assert.match(sql, /td\.one_c_stage = 'CANCELLED'[\s\S]*d\.status = 'PLANNED' OR EXISTS/);
  assert.match(sql, /te\.portal_document_id = d\.id/);
  assert.match(sql, /OR td\.status_sync_requested_at IS NOT NULL/);
  assert.deepEqual(params, [1, 2, 3, "2026-09-08T07:31:00Z", "2026-09-08T07:31:00Z", 9,
    "2026-09-08T07:30:00Z", "2026-09-08T07:30:00Z", 4]);
});

test("manual registrations extend the existing queue and respect city scope and cursor pagination", async () => {
  const repo = fakeRepository([
    document({ id: 125, status: "PLANNED", one_c_stage: "IN_PROGRESS", document_1c_guid: CREATED_PAYLOAD.document_1c_guid }),
    document({ id: 126, status: "COMPLETED", one_c_stage: "COMPLETED", document_1c_guid: CREATED_PAYLOAD.document_1c_guid, status_sync_requested_at: "2026-09-08T07:00:00Z" }),
    document({ id: 127, city: 99, status: "COMPLETED", one_c_stage: "COMPLETED", document_1c_guid: CREATED_PAYLOAD.document_1c_guid, status_sync_requested_at: "2026-09-08T07:00:00Z" }),
    document({ id: 128, status: "COMPLETED", one_c_stage: "COMPLETED", document_1c_guid: CREATED_PAYLOAD.document_1c_guid }),
  ]);
  const service = createTroIntegrationService(repo, async () => {}, { cursorSecret: "manual-registration-test-secret" });
  const first = await service.listPending(USER, { limit: 1 });
  const second = await service.listPending(USER, { limit: 1, cursor: first.pagination.next_cursor });
  assert.deepEqual([...first.data, ...second.data].map((item) => item.portal_document_id), [125, 126]);
  assert.equal(second.pagination.has_more, false);
  assert.equal(repo.documents.get(126).one_c_stage, "COMPLETED");
});

test("manual request is consumed by a fresh complete snapshot, even when stage and snapshot are identical", async () => {
  const observed = "2026-09-08T07:30:00Z";
  const repo = fakeRepository([document({ status: "COMPLETED", source_system: "UP", one_c_stage: "COMPLETED",
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid, status_sync_requested_at: observed,
    one_c_observed_at: observed, one_c_stage_updated_at: observed })]);
  const service = createTroIntegrationService(repo);
  assert.equal((await service.listPending(USER)).data.length, 1);
  const result = await service.stage(USER, 125, { document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    stage: "COMPLETED", changed_at: observed, execution_documents: [] });
  assert.equal(result.idempotent, true);
  assert.equal(repo.documents.get(125).status_sync_requested_at, null);
  assert.equal(repo.documents.get(125).status, "COMPLETED");
  assert.equal((await service.listPending(USER)).data.length, 0);
  assert.equal(repo.history.length, 0);
});

test("GET, legacy callbacks, stale observations, wrong links and older in-flight snapshots cannot consume registration", async () => {
  const repo = fakeRepository([document({ status: "COMPLETED", source_system: "UP", one_c_stage: "COMPLETED",
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid, status_sync_requested_at: "2026-09-08T07:31:00Z",
    one_c_observed_at: "2026-09-08T07:30:00Z", one_c_stage_updated_at: "2026-09-08T07:30:00Z" })]);
  const service = createTroIntegrationService(repo);
  const payload = { document_1c_guid: CREATED_PAYLOAD.document_1c_guid, stage: "COMPLETED", changed_at: "2026-09-08T07:30:00Z" };
  await service.listPending(USER);
  await service.stage(USER, 125, payload);
  await service.stage(USER, 125, { ...payload, execution_documents: [] });
  await assert.rejects(service.stage(USER, 125, { ...payload, changed_at: "2026-09-08T07:29:00Z", execution_documents: [] }), { code: "STALE_STAGE_UPDATE" });
  await assert.rejects(service.stage(USER, 125, { ...payload, document_1c_guid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", execution_documents: [] }), { code: "ONE_C_LINK_MISMATCH" });
  assert.equal(repo.documents.get(125).status_sync_requested_at, "2026-09-08T07:31:00Z");
  assert.equal((await service.listPending(USER)).data.length, 1);
});

test("resync discovers cancellation of formerly completed UP documents while retaining Portal completion protection", async () => {
  for (const status of ["PLANNED", "COMPLETED"]) {
    const repo = fakeRepository([document({ status, source_system: "UP", one_c_stage: "COMPLETED",
      document_1c_guid: CREATED_PAYLOAD.document_1c_guid, status_sync_requested_at: "2026-09-08T07:00:00Z" })]);
    const result = await createTroIntegrationService(repo).stage(USER, 125, {
      document_1c_guid: CREATED_PAYLOAD.document_1c_guid, stage: "CANCELLED", changed_at: "2026-09-08T07:31:00Z", execution_documents: [],
    });
    assert.equal(result.portal_status, status === "PLANNED" ? "CANCELLED" : "COMPLETED");
    assert.equal(repo.documents.get(125).status_sync_requested_at, null);
  }
});

test("acknowledging a manual check does not remove a remaining natural cancellation conflict", async () => {
  const repo = fakeRepository([document({ status: "COMPLETED", source_system: "UP", one_c_stage: "COMPLETED",
    document_1c_guid: CREATED_PAYLOAD.document_1c_guid, status_sync_requested_at: "2026-09-08T07:00:00Z" })]);
  const service = createTroIntegrationService(repo);
  await service.stage(USER, 125, { document_1c_guid: CREATED_PAYLOAD.document_1c_guid,
    stage: "CANCELLED", changed_at: "2026-09-08T07:31:00Z", execution_documents: EXECUTION_DOCUMENTS });
  assert.equal(repo.documents.get(125).status_sync_requested_at, null);
  assert.equal(repo.documents.get(125).status, "COMPLETED");
  assert.equal((await service.listPending(USER)).data.length, 1);
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
