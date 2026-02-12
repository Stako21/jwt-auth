import axios from "axios";
import config from "../config";
import inMemoryJWT from "./inMemoryJWT";

const api = axios.create({
  baseURL: `${config.API_URL}/directories`,
  withCredentials: true,
});



api.interceptors.request.use((cfg) => {
  const token = inMemoryJWT.getToken();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

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
