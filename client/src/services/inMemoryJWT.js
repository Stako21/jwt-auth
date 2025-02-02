import config from "../config";

const inMemoryJWTService = () => {
  let inMemoryJWT = null;
  let refreshTimeoutId = null;

  const refreshToken = (expiration) => {
    const timeoutTrigger = expiration * 1000 - 10000; // Преобразуем время истечения в миллисекунды и вычитаем 10 секунд.

    refreshTimeoutId = setTimeout(() => {
      AuthClient.post("/refresh").then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        setToken(accessToken, accessTokenExpiration);
      })
        .catch((error) => {
          console.error("Error refreshing token:", error);
        });
    }, timeoutTrigger);
  };

  const abortRefreshToken = () => {
    if (refreshTimeoutId) {
      clearTimeout(refreshTimeoutId);
    }
  };

  const getToken = () => {
    return inMemoryJWT;
  };

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
