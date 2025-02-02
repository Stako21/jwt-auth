import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { Circle, Planets, Zoom } from "react-preloaders";
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
  const [userInfo, setUserInfo] = useState();

  const handleFetchProtected = () => {
    ResourceClient.get("/protected")
      .then((res) => {
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
      .catch((error) => showErrorMessage(enqueueSnackbar, error));
  };

  const handleSignUp = (data) => {
    AuthClient.post("/sign-up", data)
      .then(() => {
        enqueueSnackbar("Реєстрація пройшла успішно!", { variant: "success" });
      })
      .catch((error) => showErrorMessage(enqueueSnackbar, error));
  };

  const handleSignIn = (data) => {
    AuthClient.post("/sign-in", data)
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        setIsUserLogged(true);

        const arrayToken = accessToken.split('.');
        const userRole = JSON.parse(atob(arrayToken[1])).role;
        const userName = JSON.parse(atob(arrayToken[1])).userName;
        const userCity = JSON.parse(atob(arrayToken[1])).city;

        setUserInfo({
          userName: userName,
          role: userRole,
          city: userCity,
        });

        const message = `${data.userName} ${userRole}`;
        enqueueSnackbar(message, { variant: 'success' });
      })
      .catch((error) => showErrorMessage(enqueueSnackbar, error));
  };

  useEffect(() => {
    AuthClient.post("/refresh")
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        setIsAppReady(true);
        setIsUserLogged(true);

        const arrayToken = accessToken.split('.');
        const userRole = JSON.parse(atob(arrayToken[1])).role;
        const userName = JSON.parse(atob(arrayToken[1])).userName;
        const userCity = JSON.parse(atob(arrayToken[1])).city;

        setUserInfo({
          userName: userName,
          role: userRole,
          city: userCity,
        });
      })
      .catch(() => {
        setIsAppReady(true);
        setIsUserLogged(false);
      });
  }, []);

  useEffect(() => {
    const handlePersistentLogOut = (event) => {
      if (event.key === config.LOGOUT_STORAGE_KEY) {
        inMemoryJWT.deleteToken();
        setIsUserLogged(false);
      }
    };

    window.addEventListener("storage", handlePersistentLogOut);

    return () => {
      window.removeEventListener("storage", handlePersistentLogOut);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        data,
        userInfo,
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
        <div className={style.centered}>
          <Zoom />
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
