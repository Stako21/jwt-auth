import test from "node:test";
import assert from "node:assert/strict";
import {
  attachUserAssortmentData,
  normalizeAssortmentGuids,
  replaceUserAssortments,
  resolveUserAssortments,
} from "../services/userAssortment.service.js";
import { ROLE_IDS } from "../utils/roles.js";
import { up as migrateUserAssortments } from "../migrations/025_user_assortments.js";

const LACMI = "11111111-1111-1111-1111-111111111111";
const MONTBLANC = "22222222-2222-2222-2222-222222222222";

const executor = {
  async query(_sql, values) {
    const requested = values[1];
    const rows = [
      { guid: LACMI, name: "Lacmi" },
      { guid: MONTBLANC, name: "MontBlanc" },
    ].filter((row) => requested.includes(row.guid));
    return [rows];
  },
};

const resolve = (role, assortmentGuids, multiAssortmentAllowed = false) =>
  resolveUserAssortments({
    role,
    assortmentGuids,
    multiAssortmentAllowed,
    branchId: 1,
    executor,
  });

test("ordinary SV requires exactly one assortment", async () => {
  await assert.rejects(resolve(ROLE_IDS.SV, []), (error) => error.error === "SV_ASSORTMENT_REQUIRED");
  assert.deepEqual(await resolve(ROLE_IDS.SV, [LACMI]), [{ guid: LACMI, name: "Lacmi" }]);
  await assert.rejects(
    resolve(ROLE_IDS.SV, [LACMI, MONTBLANC]),
    (error) => error.error === "SV_MULTIPLE_ASSORTMENTS_NOT_ALLOWED",
  );
});

test("multi-assortment SV accepts one or multiple but not zero", async () => {
  await assert.rejects(
    resolve(ROLE_IDS.SV, [], true),
    (error) => error.error === "SV_ASSORTMENT_REQUIRED",
  );
  assert.equal((await resolve(ROLE_IDS.SV, [LACMI], true)).length, 1);
  assert.equal((await resolve(ROLE_IDS.SV, [LACMI, MONTBLANC], true)).length, 2);
});

test("NTO and ordinary roles accept zero, one, or multiple assortments", async () => {
  for (const role of [ROLE_IDS.NTO, ROLE_IDS.Admin, ROLE_IDS.Accountant, ROLE_IDS.Warehouse]) {
    assert.deepEqual(await resolve(role, []), []);
    assert.equal((await resolve(role, [LACMI])).length, 1);
    assert.equal((await resolve(role, [LACMI, MONTBLANC])).length, 2);
  }
});

test("TA ignores manual assignments and derives effective assortments from active positions", async () => {
  assert.deepEqual(await resolve(ROLE_IDS.TA, [LACMI, MONTBLANC], true), []);
  const [dto] = attachUserAssortmentData(
    [{ id: 1, role: ROLE_IDS.TA, multi_assortment_allowed: 0 }],
    [{ user_id: 1, assortment_guid: LACMI, assortment_name: "Manual" }],
    [
      { user_id: 1, assortment_guid: LACMI, assortment_name: "Lacmi", is_active_1c: 1 },
      { user_id: 1, assortment_guid: MONTBLANC, assortment_name: "MontBlanc", is_active_1c: 1 },
      { user_id: 1, assortment_guid: "33333333-3333-3333-3333-333333333333", assortment_name: "Inactive", is_active_1c: 0 },
    ],
  );
  assert.deepEqual(dto.assortments, []);
  assert.deepEqual(dto.effective_assortments.map((item) => item.name), ["Lacmi", "MontBlanc"]);
});

test("unknown GUID is rejected and duplicates are normalized predictably", async () => {
  await assert.rejects(
    resolve(ROLE_IDS.NTO, ["33333333-3333-3333-3333-333333333333"]),
    (error) => error.error === "UNKNOWN_ASSORTMENT_GUID",
  );
  assert.deepEqual(normalizeAssortmentGuids([LACMI, LACMI.toUpperCase(), ""]), [LACMI]);
});

test("role change SV to TA produces no manual assignments", async () => {
  assert.deepEqual(await resolve(ROLE_IDS.TA, [LACMI]), []);
  const statements = [];
  const fakeExecutor = {
    async query(sql) {
      statements.push(String(sql));
      return [{ affectedRows: 1 }];
    },
  };
  await replaceUserAssortments(fakeExecutor, 1, []);
  assert.ok(statements.every((sql) => !sql.includes("sales_agents")));
});

test("migration preserves non-empty deprecated users assortment values", async () => {
  const statements = [];
  const fakePool = {
    async query(sql) {
      statements.push(String(sql));
      if (String(sql).includes("information_schema.columns")) return [[]];
      return [[]];
    },
  };
  await migrateUserAssortments(fakePool);
  assert.ok(
    statements.some(
      (sql) =>
        sql.includes("INSERT INTO user_assortments") &&
        sql.includes("SELECT id, LOWER(TRIM(assortment_guid)), assortment_name"),
    ),
  );
});
