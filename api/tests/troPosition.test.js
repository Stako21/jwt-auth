import test from "node:test";
import assert from "node:assert/strict";
import {
  canTopRoleSignTroDocument,
  resolveTroRequestSalesAgent,
  TroPositionError,
} from "../services/TroDocumentService.js";

const position = (overrides = {}) => ({
  id: 10,
  login: "UA013-0059",
  current_agent_guid: "11111111-1111-4111-8111-111111111111",
  full_name: "Агент",
  route_guid: "22222222-2222-4222-8222-222222222222",
  route_name: "Маршрут",
  assortment_guid: "33333333-3333-4333-8333-333333333333",
  assortment_name: "Lacmi",
  ...overrides,
});

function connection(active, known = null) {
  return {
    async query(sql) {
      if (sql.includes("WHERE branch_id = ? AND user_id = ?")) return [active];
      if (sql.includes("WHERE id = ?")) return [[known].filter(Boolean)];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

const resolve = (active, salesAgentId, known) => resolveTroRequestSalesAgent(
  connection(active, known),
  { branchId: 1, taUserId: 7, salesAgentId },
);

test("one active TRO position is auto-selected and snapshotted", async () => {
  const result = await resolve([position()]);
  assert.deepEqual(result, {
    salesAgentId: 10,
    login: "UA013-0059",
    currentAgentGuid: "11111111-1111-4111-8111-111111111111",
    currentAgentName: "Агент",
    routeGuid: "22222222-2222-4222-8222-222222222222",
    routeName: "Маршрут",
    assortmentGuid: "33333333-3333-4333-8333-333333333333",
    assortmentName: "Lacmi",
  });
});

test("multiple TRO positions require an explicit position", async () => {
  await assert.rejects(resolve([position(), position({ id: 11, login: "UA013-0095" })]),
    (error) => error instanceof TroPositionError && error.code === "TRO_SALES_AGENT_POSITION_REQUIRED");
});

test("explicit TRO position selects exactly that position", async () => {
  const result = await resolve([position(), position({ id: 11, login: "UA013-0095", assortment_name: "MontBlanc" })], 11);
  assert.equal(result.salesAgentId, 11);
  assert.equal(result.login, "UA013-0095");
  assert.equal(result.assortmentName, "MontBlanc");
});

test("zero, foreign, and inactive TRO positions return stable errors", async () => {
  await assert.rejects(resolve([]), (error) => error.code === "TRO_SALES_AGENT_POSITION_MISSING");
  await assert.rejects(resolve([position()], 99), (error) => error.code === "TRO_SALES_AGENT_POSITION_INVALID");
  await assert.rejects(resolve([position()], 99, { user_id: 7, branch_id: 1, is_active_1c: 0 }),
    (error) => error.code === "TRO_SALES_AGENT_POSITION_INACTIVE");
});

test("TRO position requires route and current agent GUID", async () => {
  await assert.rejects(resolve([position({ route_guid: null })]),
    (error) => error.code === "TRO_SALES_AGENT_ROUTE_MISSING");
  await assert.rejects(resolve([position({ current_agent_guid: null })]),
    (error) => error.code === "TRO_SALES_AGENT_GUID_MISSING");
});

test("Admin and Director may sign TRO without receiving other workflow transitions", () => {
  assert.equal(canTopRoleSignTroDocument(1, "NOT_COMPLETED"), true);
  assert.equal(canTopRoleSignTroDocument(2, "NOT_COMPLETED"), true);
  assert.equal(canTopRoleSignTroDocument(3, "NOT_COMPLETED"), false);
  assert.equal(canTopRoleSignTroDocument(1, "REVISION"), false);
  assert.equal(canTopRoleSignTroDocument(2, "REJECTED"), false);
});
