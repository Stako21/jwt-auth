// const inMemoryJWTService = () => {
//   let inMemoryJWT = null;
//   let refreshTimeoutId = null;

//   const refreshToken = (expiration) => {
//     const timeoutTrigger = expiration - 10000;

//     refreshTimeoutId = setTimeout(() => {
//       AuthClient.post("/refresh").then((res) => {
//         const { accessToken, accessTokenExpirstion } = res.data;
  
//         setToken(accessToken, accessTokenExpirstion);
//       })
//         .catch(console.error);
//     }, timeoutTrigger);
//   }

//   const abortRefreshToken = () => {
//     if (refreshTimeoutId) {
//       clearInterval(refreshTimeoutId);
//     }
//   };

//   const getToken = () => inMemoryJWT;

//   const setToken = (token, tokenExpirstion) => {
//     inMemoryJWT = token;
//     refreshToken(tokenExpirstion);
//   }

//   const deleteToken = (token, tokenExpirstion) => {
//     inMemoryJWT = null;
//     abortRefreshToken();
//   }
//   // const deleteToken = (token, tokenExpirstion) => {
//   //   inMemoryJWT = token
//   // }

//   return { getToken, setToken, deleteToken };
// };

// export default inMemoryJWTService();

class inMemoryJWT {
  constructor() {
    this.token = null;
    this.expiration = null;
  }

  setToken(token, expiration) {
    this.token = token;
    this.expiration = expiration;
  }

  getToken() {
    if (new Date() < new Date(this.expiration)) {
      return this.token;
    }
    this.deleteToken();
    return null;
  }

  deleteToken() {
    this.token = null;
    this.expiration = null;
  }
}

export default new inMemoryJWT();
