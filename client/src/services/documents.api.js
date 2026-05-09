import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/documents");

export async function createDocument(payload) {
  const { data } = await api.post("/", payload);
  return data;
}

export async function fetchDocuments(params = {}) {
  const { data } = await api.get("/", { params });
  return data;
}

export async function openDocumentPdf(id) {
  try {
    const res = await api.get(`/${id}/pdf`, { responseType: "blob" });
    const contentType = res.headers["content-type"] || "application/pdf";
    const blob = new Blob([res.data], { type: contentType });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (error) {
    console.error("Failed to open document PDF", error);
    throw error;
  }
}

export async function signDocument(id, comment) {
  return api.post(`/${id}/sign`, { comment });
}

export async function prepareDocument(id, comment) {
  return api.post(`/${id}/prepare`, { comment });
}

export async function revisionDocument(id, comment) {
  return api.post(`/${id}/revision`, { comment });
}

export async function rejectDocument(id, comment) {
  return api.post(`/${id}/reject`, { comment });
}

export async function getDocumentHistory(id) {
  const { data } = await api.get(`/${id}/history`);
  return data;
}

export async function updateDocument(id, payload) {
  const { data } = await api.put(`/${id}`, payload);
  return data;
}

export async function getDocumentById(id) {
  const { data } = await api.get(`/${id}`);
  return data;
}

export async function getDocumentNotificationHistory(id) {
  const { data } = await api.get(`/${id}/notification-history`);
  return data;
}
