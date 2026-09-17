import test from "node:test";
import assert from "node:assert/strict";
import { buildSalesAgentImportPlan } from "../services/salesAgentImportPlan.js";
import { executeSalesAgentPlan } from "../services/loadAgents.js";
import { attachUserAssortmentData } from "../services/userAssortment.service.js";

const guid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;

function user(id, name, currentGuid = null) {
  return {
    id,
    NAME: name,
    user_name: `User ${id}`,
    current_agent_guid: currentGuid,
    is_active: 1,
  };
}

function row(login, currentAgentGuid, assortment = "Lacmi", suffix = "1") {
  return {
    login,
    routeGuid: guid(suffix),
    routeName: `Route ${login}`,
    currentAgent: `Agent ${login}`,
    currentAgentGuid,
    supervisor: "Supervisor",
    supervisorGuid: guid("9"),
    regionalDivision: "City",
    regionalDivisionGuid: guid("8"),
    assortment,
    assortmentGuid: assortment === "Lacmi" ? guid("7") : guid("6"),
  };
}

test("one user with one anchor", () => {
  const plan = buildSalesAgentImportPlan({
    sourceRows: [row("A", guid("1"))],
    users: [user(1, "A", guid("1"))],
  });
  assert.deepEqual(plan.stats, {
    total: 1, positions: 1, anchors: 1, secondary: 0,
    ignored_no_login: 0, unmatched: 0, ambiguous: 0,
  });
  assert.equal(plan.positions[0].userId, 1);
});

test("anchor Lacmi and secondary MontBlanc resolve to one user", () => {
  const personGuid = guid("1");
  const plan = buildSalesAgentImportPlan({
    sourceRows: [
      row("A", personGuid, "Lacmi", "1"),
      row("B", personGuid, "MontBlanc", "2"),
    ],
    users: [user(1, "A", personGuid)],
  });
  assert.equal(plan.stats.secondary, 1);
  assert.deepEqual(plan.positions.map((position) => position.userId), [1, 1]);
  assert.deepEqual(plan.positions.map((position) => position.assortmentName), ["Lacmi", "MontBlanc"]);
  assert.equal(plan.positions[1].routeName, "Route B");
  assert.deepEqual(Object.keys(plan.anchorUpdates[0]).sort(), [
    "currentAgentGuid", "userId", "userName",
  ]);
});

test("admin user DTO contains both TA positions and their assortments", () => {
  const users = attachUserAssortmentData(
    [{ id: 1, NAME: "A", role: 5, multi_assortment_allowed: 0 }],
    [],
    [
      { id: 10, user_id: 1, login: "A", assortment_guid: guid("7"), assortment_name: "Lacmi", is_active_1c: 1 },
      { id: 11, user_id: 1, login: "B", assortment_guid: guid("6"), assortment_name: "MontBlanc", is_active_1c: 1 },
    ],
  );
  assert.deepEqual(
    users[0].effective_assortments.map((position) => position.name),
    ["Lacmi", "MontBlanc"],
  );
  assert.deepEqual(users[0].assortments, []);
});

test("person replacement recalculates and unlinks a stale secondary", () => {
  const oldGuid = guid("1");
  const nextGuid = guid("2");
  const plan = buildSalesAgentImportPlan({
    sourceRows: [row("A", nextGuid, "Lacmi", "1"), row("B", oldGuid, "MontBlanc", "2")],
    users: [user(1, "A", oldGuid)],
    existingPositions: [{ login: "A", user_id: 1 }, { login: "B", user_id: 1 }],
  });
  assert.equal(plan.positions[1].userId, null);
  assert.ok(plan.conflicts.some((conflict) => conflict.type === "PERSON_REPLACED"));
  assert.ok(plan.conflicts.some((conflict) => conflict.type === "PARTIAL_PERSON_CHANGE"));
});

test("duplicate anchor GUID rejects the complete snapshot", () => {
  assert.throws(
    () => buildSalesAgentImportPlan({
      sourceRows: [row("A", guid("1"), "Lacmi", "1"), row("B", guid("1"), "MontBlanc", "2")],
      users: [user(1, "A"), user(2, "B")],
    }),
    (error) => error.code === "AMBIGUOUS_ANCHOR_GUID",
  );
});

test("ambiguous secondary GUID rejects the complete snapshot", () => {
  assert.throws(
    () => buildSalesAgentImportPlan({
      sourceRows: [row("X", guid("1"))],
      users: [user(1, "A", guid("1")), user(2, "B", guid("1"))],
    }),
    (error) => error.code === "AMBIGUOUS_SECONDARY_GUID",
  );
});

test("duplicate login and route GUID reject instead of last-row-wins", () => {
  assert.throws(
    () => buildSalesAgentImportPlan({
      sourceRows: [row("A", guid("1"), "Lacmi", "1"), row("A", guid("2"), "MontBlanc", "2")],
      users: [],
    }),
    (error) => error.code === "DUPLICATE_LOGIN",
  );
  assert.throws(
    () => buildSalesAgentImportPlan({
      sourceRows: [row("A", guid("1"), "Lacmi", "1"), row("B", guid("2"), "MontBlanc", "1")],
      users: [],
    }),
    (error) => error.code === "DUPLICATE_ROUTE_GUID",
  );
});

test("empty login is ignored without warning or linkage", () => {
  const empty = row("", guid("1"));
  const plan = buildSalesAgentImportPlan({ sourceRows: [empty], users: [user(1, "A", guid("1"))] });
  assert.equal(plan.stats.ignored_no_login, 1);
  assert.equal(plan.stats.unmatched, 0);
  assert.equal(plan.positions.length, 0);
});

test("cross-user relink is recorded", () => {
  const plan = buildSalesAgentImportPlan({
    sourceRows: [row("B", guid("2"))],
    users: [user(2, "A", guid("2"))],
    existingPositions: [{ login: "B", user_id: 1 }],
  });
  assert.equal(plan.positions[0].userId, 2);
  assert.ok(plan.conflicts.some((conflict) => conflict.type === "CROSS_USER_RELINK"));
});

test("database write rolls back when any query fails", async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push("begin"),
    query: async () => { calls.push("query"); throw new Error("write failed"); },
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
  };
  await assert.rejects(
    executeSalesAgentPlan(connection, 1, {
      positions: [{
        userId: 1, login: "A", routeGuid: guid("1"), routeName: "Route",
        fullName: "Agent", currentAgentGuid: guid("2"), assortmentGuid: guid("3"),
        assortmentName: "Lacmi", supervisorName: "SV", supervisorGuid: guid("4"),
        city: "City", regionalDivisionGuid: guid("5"),
      }],
      anchorUpdates: [],
    }, new Date()),
    /write failed/,
  );
  assert.deepEqual(calls, ["begin", "query", "rollback"]);
});
