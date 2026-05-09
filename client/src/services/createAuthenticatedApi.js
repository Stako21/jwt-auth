import axios from "axios";
import config from "../config";
import inMemoryJWT from "./inMemoryJWT";

const refreshApi = axios.create({
  baseURL: `${config.API_URL}/auth`,
  withCredentials: true,
});

let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshApi
      .post("/refresh")
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        return accessToken;
      })
      .catch((error) => {
        inMemoryJWT.deleteToken();

        if (typeof window !== "undefined") {
          window.location.href = "/sign-in";
        }

        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export function createAuthenticatedApi(basePath) {
  const api = axios.create({
    baseURL: `${config.API_URL}${basePath}`,
    withCredentials: true,
  });

  api.interceptors.request.use((cfg) => {
    const token = inMemoryJWT.getToken();
    if (token) {
      cfg.headers = {
        ...(cfg.headers || {}),
        Authorization: `Bearer ${token}`,
      };
    }

    return cfg;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
        originalRequest._retry = true;

        const accessToken = await refreshAccessToken();
        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          Authorization: `Bearer ${accessToken}`,
        };

        return api(originalRequest);
      }

      return Promise.reject(error);
    },
  );

  return api;
}
