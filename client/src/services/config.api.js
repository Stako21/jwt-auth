import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/config");

export async function fetchAppConfig() {
  const { data } = await api.get("/app");
  return data;
}

export async function fetchBranchConfig() {
  const { data } = await api.get("/branch");
  return data.branch || null;
}

export async function updateBranchConfig(payload) {
  const { data } = await api.put("/branch", payload);
  return data.branch;
}

export async function fetchBranchesConfig() {
  const { data } = await api.get("/branches");
  return data.branches || [];
}

export async function createBranchConfig(payload) {
  const { data } = await api.post("/branches", payload);
  return data.branch;
}

export async function updateBranchByIdConfig(id, payload) {
  const { data } = await api.put(`/branches/${id}`, payload);
  return data.branch;
}

export async function setBranchConfigActive(id, isActive) {
  const { data } = await api.patch(`/branches/${id}/active`, { isActive });
  return data.branch;
}

export async function fetchCitiesConfig() {
  const { data } = await api.get("/cities");
  return data.cities || [];
}

export async function createCityConfig(payload) {
  const { data } = await api.post("/cities", payload);
  return data.city;
}

export async function updateCityConfig(id, payload) {
  const { data } = await api.put(`/cities/${id}`, payload);
  return data.city;
}

export async function setCityConfigActive(id, isActive) {
  const { data } = await api.patch(`/cities/${id}/active`, { isActive });
  return data.city;
}

export async function fetchBalancePagesConfig() {
  const { data } = await api.get("/balance-pages");
  return data.balancePages || [];
}

export async function createBalancePageConfig(payload) {
  const { data } = await api.post("/balance-pages", payload);
  return data.balancePage;
}

export async function updateBalancePageConfig(id, payload) {
  const { data } = await api.put(`/balance-pages/${id}`, payload);
  return data.balancePage;
}

export async function setBalancePageConfigActive(id, isActive) {
  const { data } = await api.patch(`/balance-pages/${id}/active`, { isActive });
  return data.balancePage;
}

export async function fetchReportsConfig() {
  const { data } = await api.get("/reports");
  return data.reports || [];
}

export async function createReportConfig(payload) {
  const { data } = await api.post("/reports", payload);
  return data.report;
}

export async function updateReportConfig(id, payload) {
  const { data } = await api.put(`/reports/${id}`, payload);
  return data.report;
}

export async function setReportConfigActive(id, isActive) {
  const { data } = await api.patch(`/reports/${id}/active`, { isActive });
  return data.report;
}

export async function fetchImportSourcesConfig() {
  const { data } = await api.get("/import-sources");
  return data.sources || [];
}

export async function updateImportSourceConfig(id, payload) {
  const { data } = await api.put(`/import-sources/${id}`, payload);
  return data.source;
}

export async function setImportSourceConfigActive(id, isActive) {
  const { data } = await api.patch(`/import-sources/${id}/active`, { isActive });
  return data.source;
}

export async function fetchUserAccessOptions() {
  const { data } = await api.get("/user-access/options");
  return data;
}

export async function fetchUserAccessConfig(userId) {
  const { data } = await api.get(`/users/${userId}/access`);
  return data.access;
}

export async function updateUserAccessConfig(userId, payload) {
  const { data } = await api.put(`/users/${userId}/access`, payload);
  return data.access;
}
