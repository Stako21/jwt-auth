import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { Circle } from "react-preloaders";
import config from "../config";
import style from "../app.module.scss";
import showErrorMessage from "../utils/showErrorMessage";
import inMemoryJWT from "../services/inMemoryJWT";
import { enqueueSnackbar } from "notistack";

export const AuthClient = axios.create({
  baseURL: `${config.API_URL}/auth`,
  withCredentials: true,
});

const ResourceClient = axios.create({
  baseURL: `${config.API_URL}/resource`,
  withCredentials: true,
});

ResourceClient.interceptors.request.use(
  (config) => {
    const accessToken = inMemoryJWT.getToken();

    if (accessToken) {
      config.headers["Authorization"] = `Bearer ${accessToken}`;
      console.log("Authorization header:", config.headers["Authorization"]);
    } else {
      console.log("No access token found");
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const AuthContext = createContext({});

const AuthProvider = ({ children }) => {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isUserLogged, setIsUserLogged] = useState(false);
  const [data, setData] = useState();

  const handleFetchProtected = () => {
    ResourceClient.get("/protected")
      .then((res) => {
        console.log('Response data:', res.data);
        setData(res.data);
      })
      .catch((error) => showErrorMessage(enqueueSnackbar, error));
  };

  const handleLogOut = () => {
    AuthClient.post("/logout")
      .then(() => {
        inMemoryJWT.deleteToken();
        setIsUserLogged(false);
      })
      .catch(showErrorMessage);
  };

  const handleSignUp = (data) => {
    AuthClient.post("/sign-up", data)
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        setIsUserLogged(true);
      })
      .catch(showErrorMessage);
  };

  const handleSignIn = (data) => {
    AuthClient.post("/sign-in", data)
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        setIsUserLogged(true);
      })
      .catch(showErrorMessage);
  };

  useEffect(() => {
    AuthClient.post("/refresh")
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        setIsAppReady(true);
        setIsUserLogged(true);
      })
      .catch(() => {
        setIsAppReady(true);
        setIsUserLogged(false);
      });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        data,
        handleFetchProtected,
        handleSignUp,
        handleSignIn,
        handleLogOut,
        isUserLogged,
        isAppReady,
      }}
    >
      {isAppReady ? (
        children
      ) : (
        <div className={style.centred}>
          <Circle />
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
