import test from "node:test";
import assert from "node:assert/strict";
import { createTroIntegrationService, IntegrationError } from "../services/TroIntegrationService.js";
import { getTroPeople } from "../../client/src/components/Documents/troPeople.js";
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
  responsible_guid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  responsible_name: "Администратор",
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
    executor_guid: null,
    one_c_sales_agent_id: null,
    one_c_sales_agent_guid: null,
    one_c_sales_agent_name: null,
    warehouse_guid: null,
    one_c_stage: null,
    one_c_stage_updated_at: null,
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
    async getReadyCeiling({ branchIds, movementType }) {
      const rows = [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id)
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
    async listReady({ branchIds, movementType, after, ceiling, limit }) {
      return [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id)
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
          trade_point_address: "Адреса", contractor_guid: "co", contractor_name: "Контрагент",
          request_agent_guid: "agent", request_agent_name: "ТА заявки",
        }));
    },
    async getItems() { return []; },
    async getPendingCeiling({ branchIds }) {
      const rows = [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id) && item.document_1c_guid
        && item.status !== "REJECTED" && [null, "NEW", "IN_PROGRESS"].includes(item.one_c_stage))
        .sort((left, right) => compareCursorTuple(left, {
          createdAt: right.created_at,
          id: right.id,
        }));
      const last = rows.at(-1);
      return last ? { createdAt: last.created_at, id: last.id } : null;
    },
    async listPending({ branchIds, after, ceiling, limit }) {
      return [...documents.values()].filter((item) =>
        branchIds.includes(item.branch_id) && item.document_1c_guid
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
  assert.deepEqual(result.data.map((item) => item.portal_document_id), [125]);
  assert.equal(result.data[0].status, "NOT_COMPLETED");
  assert.deepEqual(result.pagination, { next_cursor: null, has_more: false });
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
