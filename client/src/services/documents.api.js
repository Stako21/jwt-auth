import axios from "axios";
import config from "../config";
import inMemoryJWT from "./inMemoryJWT";

const api = axios.create({
  baseURL: `${config.API_URL}/documents`,
  withCredentials: true,
});
const refreshApi = axios.create({
  baseURL: `${config.API_URL}/auth`,
  withCredentials: true,
});

api.interceptors.request.use(
  (cfg) => {
    const token = inMemoryJWT.getToken();
    if (token)
      cfg.headers = {
        ...(cfg.headers || {}),
        Authorization: `Bearer ${token}`,
      };
    return cfg;
  },
  (err) => Promise.reject(err),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const res = await refreshApi.post("/refresh");
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);

        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          Authorization: `Bearer ${accessToken}`,
        };

        return api(originalRequest);
      } catch (refreshError) {
        inMemoryJWT.deleteToken();
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

// export async function createDocument(data) {
//   const { data: resData } = await api.post("/", data);
//   return resData;
// }
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
    // revoke after a minute
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (e) {
    console.error("Failed to open document PDF", e);
    throw e;
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
// export async function getDocumentNotificationHistory(id) {
//   const res = await ResourceClient.get(
//     `/${id}/notifications-history`
//   );
//   return res.data;
// }
