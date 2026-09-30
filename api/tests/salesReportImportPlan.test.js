import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSalesReportImportPlan,
  normalizeSalesReportSource,
} from "../services/salesReportImportPlan.js";
import { executeSalesReportImportPlan } from "../services/loadReports.js";

const guid = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function sourceRow(overrides = {}) {
  return {
    DocumentGuid: guid(1),
    salesAgentGuid: guid(101),
    agentLogins: ["UA013-0047"],
    number: "СГ0001",
    date: "2026-09-15T08:00:00",
    amount: 100,
    pointOfSale: "Point",
    customer: "Customer",
    comment: "",
    form2: false,
    isDeleted: false,
    salesAgent: "Agent One",
    ...overrides,
  };
}

function portalUser(id, login, currentGuid) {
  return { id, NAME: login, user_name: `User ${id}`, current_agent_guid: currentGuid };
}

function lookups({
  row = sourceRow(),
  user = portalUser(1, "UA013-0047", guid(101)),
  loginUsers,
  guidUsers,
  existingRows = [],
  existingNumberRows = [],
  legacyRows = [],
} = {}) {
  return {
    usersByGuid: new Map([
      [row.salesAgentGuid.toLowerCase(), guidUsers ?? [user]],
    ]),
    agentsByLogin: new Map(
      row.agentLogins.map((login) => [login, loginUsers ?? [user]]),
    ),
    existingByGuid: new Map([[row.DocumentGuid.toLowerCase(), existingRows]]),
    existingByNumber: new Map([[row.number, existingNumberRows]]),
    legacyByNumber: new Map([[row.number, legacyRows]]),
  };
}

function planFor(row, lookupOverrides = {}) {
  const snapshot = normalizeSalesReportSource([row]);
  return buildSalesReportImportPlan({
    snapshot,
    ...lookups({ row, ...lookupOverrides }),
  });
}

test("ordinary TA resolves by GUID and login to one sale", () => {
  const plan = planFor(sourceRow());
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].user.id, 1);
  assert.equal(plan.counters.resolved_by_guid_and_login, 1);
});

test("multi-position TA logins resolve to one user and one sale", () => {
  const row = sourceRow({
    salesAgentGuid: "6cf3fb81-77da-11ee-80e7-0050568a5bd8",
    agentLogins: ["UA013-0059", "UA013-0095"],
  });
  const user = portalUser(246, "UA013-0059", row.salesAgentGuid);
  const plan = planFor(row, { user });
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].user.id, 246);
  assert.equal(plan.actions[0].user.loginAgent, "UA013-0059");
});

test("Kovalenko route logins resolve to one user", () => {
  const row = sourceRow({
    salesAgentGuid: "a50fda42-9167-11f1-bb31-08f1ea7c794f",
    agentLogins: ["UA013-0007", "UA013-0093"],
  });
  const plan = planFor(row, {
    user: portalUser(241, "UA013-0093", row.salesAgentGuid),
  });
  assert.equal(plan.actions[0].user.id, 241);
});

test("Office KAM route logins resolve to one user", () => {
  const row = sourceRow({
    salesAgentGuid: "92c838c7-5a6a-11f1-bb2f-08f1ea7c794f",
    agentLogins: ["UA013-0092", "UA013-0094"],
  });
  const plan = planFor(row, {
    user: portalUser(242, "UA013-0094", row.salesAgentGuid),
  });
  assert.equal(plan.actions[0].user.id, 242);
});

test("duplicate and empty route logins normalize to unique non-empty values", () => {
  const snapshot = normalizeSalesReportSource([
    sourceRow({ agentLogins: [" UA013-0059 ", "", "UA013-0059", "UA013-0095"] }),
  ]);
  assert.deepEqual(snapshot.rows[0].agentLogins, ["UA013-0059", "UA013-0095"]);
});

test("empty agentLogins may resolve solely by salesAgentGuid", () => {
  const row = sourceRow({ agentLogins: [] });
  const plan = planFor(row);
  assert.equal(plan.counters.resolved_by_agent_guid, 1);
  assert.equal(plan.actions.length, 1);
});

test("different GUID and login users produce AGENT_MAPPING_CONFLICT", () => {
  const row = sourceRow();
  const plan = planFor(row, {
    guidUsers: [portalUser(1, "A", row.salesAgentGuid)],
    loginUsers: [portalUser(2, "B", guid(202))],
  });
  assert.equal(plan.skippedConflicts[0].code, "AGENT_MAPPING_CONFLICT");
});

test("route logins mapped to different users produce multi-user conflict", () => {
  const row = sourceRow({ agentLogins: ["A", "B"] });
  const snapshot = normalizeSalesReportSource([row]);
  const plan = buildSalesReportImportPlan({
    snapshot,
    usersByGuid: new Map(),
    agentsByLogin: new Map([
      ["A", [portalUser(1, "A", guid(1))]],
      ["B", [portalUser(2, "B", guid(2))]],
    ]),
  });
  assert.equal(plan.skippedConflicts[0].code, "AGENT_LOGINS_MULTI_USER_CONFLICT");
});

test("unknown GUID and logins skip a new document without blocking the import", () => {
  const row = sourceRow();
  const snapshot = normalizeSalesReportSource([row]);
  const plan = buildSalesReportImportPlan({ snapshot });
  assert.equal(plan.actions.length, 0);
  assert.equal(plan.counters.unresolved, 1);
  assert.equal(plan.hasSkippedConflicts, false);
  assert.deepEqual(plan.diagnostics[0], {
    code: "UNRESOLVED_AGENT",
    documentGuid: row.DocumentGuid.toLowerCase(),
    documentNumber: row.number,
    salesAgentGuid: row.salesAgentGuid.toLowerCase(),
    salesAgentName: row.salesAgent,
    agentLogins: row.agentLogins,
  });
});

test("unresolved documents do not prevent resolved documents from being planned", () => {
  const resolved = sourceRow();
  const unresolved = sourceRow({
    DocumentGuid: guid(2),
    salesAgentGuid: guid(102),
    agentLogins: [],
    number: "СГ0002",
    salesAgent: "Former employee",
  });
  const snapshot = normalizeSalesReportSource([resolved, unresolved]);
  const user = portalUser(1, "UA013-0047", guid(101));
  const plan = buildSalesReportImportPlan({
    snapshot,
    usersByGuid: new Map([[guid(101), [user]]]),
    agentsByLogin: new Map([["UA013-0047", [user]]]),
  });

  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].row.documentGuid, guid(1));
  assert.equal(plan.counters.unresolved, 1);
  assert.equal(plan.diagnostics[0].documentGuid, guid(2));
  assert.equal(plan.hasSkippedConflicts, false);
});

test("existing GUID preserves its user when source agent is no longer current", () => {
  const row = sourceRow();
  const existing = {
    id: 10,
    status: "ACTIVE",
    user_id: 7,
    login_agent: "WORKPLACE",
    sales_agent_name: "Previous employee",
    document_date_iso: "2026-09-15",
  };
  const snapshot = normalizeSalesReportSource([row]);
  const plan = buildSalesReportImportPlan({
    snapshot,
    existingByGuid: new Map([[row.DocumentGuid.toLowerCase(), [existing]]]),
  });
  assert.equal(plan.actions[0].user.id, 7);
  assert.equal(plan.counters.existing_document_agent_not_current, 1);
  assert.equal(plan.diagnostics[0].code, "EXISTING_DOCUMENT_AGENT_NOT_CURRENT");
});

test("existing GUID reassignment creates a history-preserving replacement", () => {
  const row = sourceRow();
  const existing = {
    id: 10,
    status: "ACTIVE",
    user_id: 9,
    login_agent: "OLD",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingRows: [existing] });
  assert.equal(plan.hasSkippedConflicts, false);
  assert.equal(plan.actions[0].type, "REPLACE_EXISTING");
  assert.equal(plan.actions[0].reason, "DOCUMENT_USER_REASSIGNED");
  assert.equal(plan.counters.reassigned, 1);
  assert.equal(plan.adjustments[0].code, "DOCUMENT_USER_REASSIGNED");
});

test("same document number with a replaced 1C GUID replaces the active version", () => {
  const row = sourceRow({ DocumentGuid: guid(2) });
  const previous = {
    id: 10,
    status: "ACTIVE",
    document_guid: guid(1),
    user_id: 1,
    login_agent: "UA013-0047",
    sales_agent_name: "Agent One",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingNumberRows: [previous] });
  assert.equal(plan.hasSkippedConflicts, false);
  assert.equal(plan.actions[0].type, "REPLACE_EXISTING");
  assert.equal(plan.actions[0].reason, "DOCUMENT_GUID_REPLACED");
  assert.equal(plan.counters.document_guid_change, 1);
  assert.equal(plan.adjustments[0].previousDocumentGuid, guid(1));
});

test("ambiguous active rows with one document number skip only that document", () => {
  const conflicting = sourceRow({ DocumentGuid: guid(2), number: "CONFLICT" });
  const valid = sourceRow({ DocumentGuid: guid(3), number: "VALID" });
  const snapshot = normalizeSalesReportSource([conflicting, valid]);
  const user = portalUser(1, "UA013-0047", guid(101));
  const active = (id, documentGuid) => ({
    id,
    status: "ACTIVE",
    document_guid: documentGuid,
    user_id: 1,
    login_agent: "UA013-0047",
    document_date_iso: "2026-09-15",
  });
  const plan = buildSalesReportImportPlan({
    snapshot,
    usersByGuid: new Map([[guid(101), [user]]]),
    agentsByLogin: new Map([["UA013-0047", [user]]]),
    existingByNumber: new Map([
      ["CONFLICT", [active(10, guid(10)), active(11, guid(11))]],
    ]),
  });
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].row.number, "VALID");
  assert.equal(plan.skippedConflicts[0].code, "ACTIVE_DOCUMENT_NUMBER_AMBIGUOUS");
  assert.equal(plan.counters.skipped_conflicts, 1);
});

test("one canonical legacy row is backfilled instead of inserting a duplicate", () => {
  const row = sourceRow();
  const legacy = {
    id: 20,
    status: "ACTIVE",
    document_guid: null,
    login_agent: "UA013-0047",
    user_id: 1,
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { legacyRows: [legacy] });
  assert.equal(plan.actions[0].type, "BACKFILL_LEGACY");
  assert.equal(plan.counters.legacy_backfilled, 1);
  assert.equal(plan.counters.new_insert, 0);
});

test("ambiguous canonical legacy rows are skipped explicitly", () => {
  const row = sourceRow();
  const legacy = (id) => ({
    id,
    status: "ACTIVE",
    document_guid: null,
    login_agent: "UA013-0047",
    user_id: 1,
    document_date_iso: "2026-09-15",
  });
  const plan = planFor(row, { legacyRows: [legacy(20), legacy(21)] });
  assert.equal(plan.skippedConflicts[0].code, "LEGACY_BACKFILL_AMBIGUOUS");
});

test("legacy MOVED history does not make the single ACTIVE row ambiguous", () => {
  const row = sourceRow();
  const plan = planFor(row, {
    legacyRows: [
      {
        id: 20,
        status: "MOVED",
        document_guid: null,
        login_agent: "UA013-0047",
        user_id: 1,
        document_date_iso: "2026-09-14",
        replaced_by_id: 21,
      },
      {
        id: 21,
        status: "ACTIVE",
        document_guid: null,
        login_agent: "UA013-0047",
        user_id: 1,
        document_date_iso: "2026-09-15",
      },
    ],
  });
  assert.equal(plan.hasSkippedConflicts, false);
  assert.equal(plan.actions[0].existing.id, 21);
});

test("duplicate DocumentGuid in one source fails before planning", () => {
  assert.throws(
    () => normalizeSalesReportSource([
      sourceRow(),
      sourceRow({ number: "СГ0002" }),
    ]),
    (error) => error.code === "DUPLICATE_DOCUMENT_GUID_IN_SOURCE",
  );
});

test("one source snapshot cannot contain one number with different GUIDs", () => {
  assert.throws(
    () => normalizeSalesReportSource([
      sourceRow(),
      sourceRow({ DocumentGuid: guid(2) }),
    ]),
    (error) => error.code === "DUPLICATE_DOCUMENT_NUMBER_IN_SOURCE",
  );
});

test("isDeleted updates the same GUID to CANCELLED without a second row", async () => {
  const row = sourceRow({ isDeleted: true });
  const existing = {
    id: 10,
    status: "ACTIVE",
    user_id: 1,
    login_agent: "UA013-0047",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingRows: [existing] });
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM sales_reports")) return [[{ id: 10 }]];
      return [{ affectedRows: 1 }];
    },
  };
  const result = await executeSalesReportImportPlan(connection, plan, {
    importId: 1,
    branchId: 1,
  });
  assert.equal(result.cancelledCount, 1);
  assert.equal(result.insertedCount, 0);
  assert.ok(calls.some(({ sql }) => sql.includes("status = 'CANCELLED'")));
  assert.ok(!calls.some(({ sql }) => sql.includes("INSERT INTO sales_reports")));
});

test("date change leaves one active GUID and creates MOVED history", async () => {
  const row = sourceRow({ date: "2026-09-16T08:00:00" });
  const existing = {
    id: 10,
    status: "ACTIVE",
    user_id: 1,
    login_agent: "UA013-0047",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingRows: [existing] });
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM sales_reports")) return [[{ id: 10 }]];
      if (sql.includes("INSERT INTO sales_reports")) return [{ insertId: 11 }];
      return [{ affectedRows: 1 }];
    },
  };
  const result = await executeSalesReportImportPlan(connection, plan, {
    importId: 1,
    branchId: 1,
  });
  assert.equal(result.movedCount, 1);
  assert.equal(result.insertedCount, 1);
  assert.ok(calls.some(({ sql }) => sql.includes("status = 'MOVED'")));
});

test("GUID replacement retires the old row before inserting the new active row", async () => {
  const row = sourceRow({ DocumentGuid: guid(2) });
  const previous = {
    id: 10,
    status: "ACTIVE",
    document_guid: guid(1),
    user_id: 1,
    login_agent: "UA013-0047",
    sales_agent_name: "Agent One",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingNumberRows: [previous] });
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM sales_reports")) return [[]];
      if (sql.includes("INSERT INTO sales_reports")) return [{ insertId: 11 }];
      return [{ affectedRows: 1 }];
    },
  };
  const result = await executeSalesReportImportPlan(connection, plan, {
    importId: 1,
    branchId: 1,
  });
  const retiredAt = calls.findIndex(({ sql }) => sql.includes("status = 'MOVED'"));
  const insertedAt = calls.findIndex(({ sql }) => sql.includes("INSERT INTO sales_reports"));
  assert.ok(retiredAt >= 0 && retiredAt < insertedAt);
  assert.equal(result.guidReplacedCount, 1);
  assert.equal(result.movedCount, 1);
  assert.equal(result.insertedCount, 1);
  assert.match(calls[retiredAt].params[0], /GUID/);
  assert.match(calls[retiredAt].sql, /amount = 0/);
  assert.equal(calls[insertedAt].params[8], row.amount);
});

test("TA reassignment preserves the old snapshot and inserts the new one", async () => {
  const row = sourceRow({ salesAgent: "New Agent" });
  const existing = {
    id: 10,
    status: "ACTIVE",
    document_guid: guid(1),
    user_id: 9,
    login_agent: "OLD-WORKPLACE",
    sales_agent_name: "Old Agent",
    sales_agent_guid: guid(909),
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingRows: [existing] });
  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM sales_reports")) return [[{ id: 10 }]];
      if (sql.includes("INSERT INTO sales_reports")) return [{ insertId: 11 }];
      return [{ affectedRows: 1 }];
    },
  };
  const result = await executeSalesReportImportPlan(connection, plan, {
    importId: 1,
    branchId: 1,
  });
  const retired = calls.find(({ sql }) => sql.includes("status = 'MOVED'"));
  const inserted = calls.find(({ sql }) => sql.includes("INSERT INTO sales_reports"));
  assert.equal(result.reassignedCount, 1);
  assert.match(retired.params[0], /Old Agent → New Agent/);
  assert.ok(!retired.sql.includes("sales_agent_name ="));
  assert.equal(inserted.params[6], "New Agent");
  assert.equal(inserted.params[5], 1);
});

test("simultaneous TA and date change creates only one replacement", async () => {
  const row = sourceRow({ date: "2026-09-16T08:00:00", salesAgent: "New Agent" });
  const existing = {
    id: 10,
    status: "ACTIVE",
    document_guid: guid(1),
    user_id: 9,
    login_agent: "OLD-WORKPLACE",
    sales_agent_name: "Old Agent",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingRows: [existing] });
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].type, "REPLACE_EXISTING");

  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM sales_reports")) return [[{ id: 10 }]];
      if (sql.includes("INSERT INTO sales_reports")) return [{ insertId: 11 }];
      return [{ affectedRows: 1 }];
    },
  };
  await executeSalesReportImportPlan(connection, plan, { importId: 1, branchId: 1 });
  const historyCall = calls.find(({ sql }) => sql.includes("status = 'MOVED'"));
  assert.match(historyCall.params[0], /ТА змінено/);
  assert.match(historyCall.params[0], /дату змінено/);
  assert.equal(calls.filter(({ sql }) => sql.includes("INSERT INTO sales_reports")).length, 1);
});

test("a reassigned document can later be cancelled without another replacement", async () => {
  const row = sourceRow({ isDeleted: true, salesAgent: "New Agent" });
  const current = {
    id: 11,
    status: "ACTIVE",
    document_guid: guid(1),
    user_id: 1,
    login_agent: "UA013-0047",
    sales_agent_name: "New Agent",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, {
    existingRows: [current],
    existingNumberRows: [current],
  });
  assert.equal(plan.actions[0].type, "UPDATE_EXISTING");

  const calls = [];
  const connection = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id FROM sales_reports")) return [[{ id: 11 }]];
      return [{ affectedRows: 1 }];
    },
  };
  const result = await executeSalesReportImportPlan(connection, plan, {
    importId: 2,
    branchId: 1,
  });
  assert.equal(result.cancelledCount, 1);
  assert.ok(calls.some(({ sql }) => sql.includes("status = 'CANCELLED'")));
  assert.ok(!calls.some(({ sql }) => sql.includes("INSERT INTO sales_reports")));
});

test("returning a document to its former TA creates one new history version", () => {
  const row = sourceRow({ salesAgent: "Former Agent" });
  const formerUser = portalUser(9, "OLD-WORKPLACE", row.salesAgentGuid);
  const current = {
    id: 11,
    status: "ACTIVE",
    document_guid: guid(1),
    user_id: 1,
    login_agent: "UA013-0047",
    sales_agent_name: "Current Agent",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, {
    user: formerUser,
    existingRows: [current],
    existingNumberRows: [current],
  });
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].type, "REPLACE_EXISTING");
  assert.equal(plan.actions[0].user.id, 9);
});

test("re-import of the current replacement updates it without another history row", () => {
  const row = sourceRow({ DocumentGuid: guid(2) });
  const current = {
    id: 11,
    status: "ACTIVE",
    document_guid: guid(2),
    user_id: 1,
    login_agent: "UA013-0047",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, {
    existingRows: [current],
    existingNumberRows: [current],
  });
  assert.equal(plan.actions[0].type, "UPDATE_EXISTING");
  assert.equal(plan.counters.document_guid_change, 0);
  assert.equal(plan.counters.reassigned, 0);
});

test("new contract does not plan sales_agent_id or assortment fields", () => {
  const plan = planFor(sourceRow());
  const serialized = JSON.stringify(plan.actions[0]);
  assert.ok(!serialized.includes("sales_agent_id"));
  assert.ok(!serialized.includes("assortment"));
});
