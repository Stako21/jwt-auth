import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createIntegrationAccountsService } from "../services/IntegrationAccountsService.js";

function repository() {
  const saved = [];
  const passwordHash = bcrypt.hashSync("secret-123", 4);
  return {
    saved,
    async findByLogin(login) { return login === "central.sync" ? { id: 7, login, display_name: "Центральна синхронізація", is_active: 1, can_process_requests: 0, can_sync_statuses: 1, password_hash: passwordHash } : null; },
    async findActiveWithScope() { return { id: 7, login: "central.sync", display_name: "Центральна синхронізація", can_process_requests: 0, can_sync_statuses: 1, cities: [{ city_id: 3, branch_id: 1 }, { city_id: 4, branch_id: 1 }] }; },
    async touchLogin() {},
    async cityOptions() { return [{ id: 3, name: "Запоріжжя", branch_id: 1, branch_name: "Філія" }, { id: 4, name: "Дніпро", branch_id: 1, branch_name: "Філія" }]; },
    async list() { return { accounts: [], cities: [] }; },
    async save(values) { saved.push(values); return 9; },
  };
}

test("technical account login returns a purpose-bound integration token", async () => {
  const previous = process.env.ACCESS_TOKEN_SECRET;
  process.env.ACCESS_TOKEN_SECRET = "integration-account-test-secret";
  try {
    const result = await createIntegrationAccountsService(repository()).signIn({ login: "CENTRAL.SYNC", password: "secret-123" });
    const decoded = jwt.verify(result.accessToken, process.env.ACCESS_TOKEN_SECRET);
    assert.equal(decoded.principalType, "integration");
    assert.equal(decoded.integrationAccountId, 7);
    assert.equal(result.accessTokenExpiration, 1800000);
    assert.deepEqual(result.account.city_ids, [3, 4]);
  } finally { process.env.ACCESS_TOKEN_SECRET = previous; }
});

test("multiple accounts may be saved with overlapping city scopes", async () => {
  const repo = repository();
  const service = createIntegrationAccountsService(repo);
  const common = { password: "secret-123", display_name: "Бухгалтер", is_active: true, can_process_requests: true, can_sync_statuses: false };
  await service.save(null, { ...common, login: "accountant.a", city_ids: [3, 4] }, 1);
  await service.save(null, { ...common, login: "accountant.b", city_ids: [4] }, 1);
  assert.deepEqual(repo.saved.map((item) => item.cityIds), [[3, 4], [4]]);
});
