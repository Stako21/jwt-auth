import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/reports");

export async function fetchReportDateRange() {
  const { data } = await api.get("/date-range");
  return data;
}

export async function fetchSalesReport(params = {}) {
  const { data } = await api.get("/sales", { params });
  return data;
}

export async function fetchSalesReportPdf(params = {}) {
  return api.get("/sales/pdf", {
    params,
    responseType: "blob",
  });
}

export async function fetchStaticReport(reportKey, params = {}) {
  const { data } = await api.get(`/static/${reportKey}`, { params });
  return data;
}
