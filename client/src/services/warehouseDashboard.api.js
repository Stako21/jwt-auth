import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/warehouse-dashboard");

export async function fetchWarehouseDashboard(warehouseId) {
  const { data } = await api.get("/", {
    params: warehouseId ? { warehouseId } : {},
  });
  return data;
}

export async function fetchWarehouseDashboardAccounts() {
  const { data } = await api.get("/accounts");
  return data;
}

export async function createWarehouseDashboardAccount(payload) {
  const { data } = await api.post("/accounts", payload);
  return data;
}

export async function updateWarehouseDashboardAccount(id, payload) {
  const { data } = await api.put(`/accounts/${id}`, payload);
  return data;
}
