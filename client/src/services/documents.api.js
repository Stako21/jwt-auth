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

export async function fetchDocumentRegistryColumns(category) {
  const { data } = await api.get("/export/columns", { params: { category } });
  return data;
}

export async function fetchSelectedDocumentRegistry(documentIds, category, columnKeys) {
  const { data } = await api.post("/export/registry", {
    documentIds,
    category,
    columnKeys,
  });
  return data;
}

function getDownloadFileName(contentDisposition, fallback) {
  const encodedMatch = String(contentDisposition || "").match(
    /filename\*=UTF-8''([^;]+)/i,
  );
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function downloadSelectedDocumentsXlsx(documentIds, category, columnKeys) {
  let response;
  try {
    response = await api.post(
      "/export/xlsx",
      { documentIds, category, columnKeys },
      { responseType: "blob" },
    );
  } catch (error) {
    if (error?.response?.data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await error.response.data.text());
      } catch {
        // Keep the original response when it is not a JSON error payload.
      }
    }
    throw error;
  }
  const fallback = category === "tro"
    ? "tro-documents.xlsx"
    : "return-exchange-documents.xlsx";
  const fileName = getDownloadFileName(
    response.headers["content-disposition"],
    fallback,
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
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

export async function getTroTaOptions() {
  const { data } = await api.get("/tro/ta-options");
  return data;
}

export async function updateTroAccounting(id, payload) {
  const { data } = await api.put(`/${id}/tro-accounting`, payload);
  return data;
}
