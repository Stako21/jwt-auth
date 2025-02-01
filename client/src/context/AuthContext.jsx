import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { Circle, Planets, Zoom } from "react-preloaders";
import config from "../config";
import style from "../app.module.scss";
import showErrorMessage from "../utils/showErrorMessage";
import inMemoryJWT from "../services/inMemoryJWT";
import { enqueueSnackbar } from "notistack";

console.log("config.API_URL");
console.log(config.API_URL);

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
  const [userInfo, setUserInfo] = useState();

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
      .then(() => {
        enqueueSnackbar("Реєстрація пройшла успішно!", { variant: "success" });
      })
      .catch(showErrorMessage);
  };

  const handleSignIn = (data) => {
    AuthClient.post("/sign-in", data)
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        setIsUserLogged(true);

        console.log('accessToken ::::: ');
        console.log(accessToken);

        const arrayToken = accessToken.split('.');
        const userRole = JSON.parse(atob(arrayToken[1])).role;
        const userName = JSON.parse(atob(arrayToken[1])).userName;
        const userCity = JSON.parse(atob(arrayToken[1])).city;

        console.log("2JSON.parse(atob(arrayToken[1]))", JSON.parse(atob(arrayToken[1])));
        console.log('Role :::: ', userRole);
        console.log('City :::: ', userCity);

        setUserInfo({
          userName: userName,
          role: userRole,
          city: userCity,
        });

        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&res.data");
        console.log(data);

        const message = `${data.userName} ${userRole}`;
        enqueueSnackbar(message, { variant: 'success' });
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

        console.log('accessToken !!!::::: ');
        console.log(accessToken);

        const arrayToken = accessToken.split('.');
        const userRole = JSON.parse(atob(arrayToken[1])).role;
        const userName = JSON.parse(atob(arrayToken[1])).userName;
        const userCity = JSON.parse(atob(arrayToken[1])).city;

        console.log("2_JSON.parse(atob(arrayToken[1]))", JSON.parse(atob(arrayToken[1])));
        console.log('Role :::: ', userRole);

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
