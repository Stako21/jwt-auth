import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/directories");

export async function fetchTradePoints() {
  const { data } = await api.get("/trade-points");
  return data;
}

export async function fetchProducts() {
  const { data } = await api.get("/products");
  return data;
}

export async function fetchContractors() {
  const { data } = await api.get("/contractors");
  return data;
}

export async function fetchProductGroups() {
  const { data } = await api.get("/product-groups");
  return data;
}
