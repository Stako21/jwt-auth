import { createAuthenticatedApi } from "./createAuthenticatedApi";
const api = createAuthenticatedApi("/integration-accounts");
export async function fetchIntegrationAccounts() { const { data } = await api.get("/"); return data.data; }
export async function createIntegrationAccount(payload) { const { data } = await api.post("/", payload); return data.data; }
export async function updateIntegrationAccount(id, payload) { const { data } = await api.put(`/${id}`, payload); return data.data; }
