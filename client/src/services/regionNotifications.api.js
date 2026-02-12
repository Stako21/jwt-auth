import axios from "axios";
import config from "../config";
import inMemoryJWT from "./inMemoryJWT";

const api = axios.create({
  baseURL: `${config.API_URL}/auth/region-notifications`,
  withCredentials: true,
});

api.interceptors.request.use((cfg) => {
  const token = inMemoryJWT.getToken();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

export async function fetchRegionNotifications() {
  const { data } = await api.get("/");
  return data;
}

export async function createRegionNotification(notification) {
  const { data } = await api.post("/", notification);
  return data;
}

export async function updateRegionNotification(id, notification) {
  const { data } = await api.put(`/${id}`, notification);
  return data;
}

export async function deleteRegionNotification(id) {
  const { data } = await api.delete(`/${id}`);
  return data;
}
