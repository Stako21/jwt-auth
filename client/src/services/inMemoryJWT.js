const inMemoryJWTService = () => {
  let inMemoryJWT = null;
  let refreshTimeoutId = null;

  const refreshToken = (expiration) => {
    const timeoutTrigger = expiration * 1000 - 10000; // Преобразуем время истечения в миллисекунды и вычитаем 10 секунд

    console.log("Setting refresh timeout for token expiration:", expiration);
    console.log("Timeout trigger set to:", timeoutTrigger);

    refreshTimeoutId = setTimeout(() => {
      console.log("Attempting to refresh token...");
      AuthClient.post("/refresh").then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        console.log("Token refreshed successfully:", accessToken);
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
      console.log("Refresh token timeout aborted");
    }
  };

  const getToken = () => {
    console.log("Getting token:", inMemoryJWT);
    return inMemoryJWT;
  };

  const setToken = (token, tokenExpiration) => {
    console.log("Setting token:", token);
    console.log("Token expiration time:", tokenExpiration);
    inMemoryJWT = token;
    refreshToken(tokenExpiration);
  };

  const deleteToken = () => {
    console.log("Deleting token");
    inMemoryJWT = null;
    abortRefreshToken();
  };

  return { getToken, setToken, deleteToken };
};

export default inMemoryJWTService();
