import { createAuthenticatedApi } from "./createAuthenticatedApi";

const api = createAuthenticatedApi("/region-notifications");

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
