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
  assert.equal(plan.hardConflicts[0].code, "AGENT_MAPPING_CONFLICT");
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
  assert.equal(plan.hardConflicts[0].code, "AGENT_LOGINS_MULTI_USER_CONFLICT");
});

test("unknown GUID and logins produce UNRESOLVED_AGENT for a new document", () => {
  const row = sourceRow();
  const snapshot = normalizeSalesReportSource([row]);
  const plan = buildSalesReportImportPlan({ snapshot });
  assert.equal(plan.hardConflicts[0].code, "UNRESOLVED_AGENT");
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

test("existing GUID is not silently reassigned to another workplace", () => {
  const row = sourceRow();
  const existing = {
    id: 10,
    status: "ACTIVE",
    user_id: 9,
    login_agent: "OLD",
    document_date_iso: "2026-09-15",
  };
  const plan = planFor(row, { existingRows: [existing] });
  assert.equal(plan.hardConflicts[0].code, "DOCUMENT_USER_CHANGE");
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

test("ambiguous canonical legacy rows fail explicitly", () => {
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
  assert.equal(plan.hardConflicts[0].code, "LEGACY_BACKFILL_AMBIGUOUS");
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
  assert.equal(plan.hasHardConflicts, false);
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

test("new contract does not plan sales_agent_id or assortment fields", () => {
  const plan = planFor(sourceRow());
  const serialized = JSON.stringify(plan.actions[0]);
  assert.ok(!serialized.includes("sales_agent_id"));
  assert.ok(!serialized.includes("assortment"));
});
