import axios from "axios";
import config from "../config";

const refreshClient = axios.create({
  baseURL: `${config.API_URL}/auth`,
  withCredentials: true,
});

const inMemoryJWTService = () => {
  let inMemoryJWT = null;
  let refreshTimeoutId = null;

  const abortRefreshToken = () => {
    if (refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
      refreshTimeoutId = null;
    }
  };

  const refreshToken = (expiration) => {
    const timeoutTrigger = Math.max(0, Number(expiration) - 10000);
    abortRefreshToken();

    refreshTimeoutId = setTimeout(() => {
      refreshClient
        .post("/refresh")
        .then((res) => {
          const { accessToken, accessTokenExpiration } = res.data;
          setToken(accessToken, accessTokenExpiration);
        })
        .catch((error) => {
          console.error("Error refreshing token:", error);
          deleteToken();
        });
    }, timeoutTrigger);
  };

  const getToken = () => inMemoryJWT;

  const setToken = (token, tokenExpiration) => {
    inMemoryJWT = token;
    refreshToken(tokenExpiration);
  };

  const deleteToken = () => {
    inMemoryJWT = null;
    abortRefreshToken();
    localStorage.setItem(config.LOGOUT_STORAGE_KEY, Date.now());
  };

  return { getToken, setToken, deleteToken };
};

export default inMemoryJWTService();
