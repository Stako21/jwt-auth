import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { Circle } from "react-preloaders";
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

        console.log('accessToken ::::: ');
        console.log(accessToken);

        const arrayToken = accessToken.split('.');
        const userRole = JSON.parse(atob(arrayToken[1])).role
        const userName = JSON.parse(atob(arrayToken[1])).userName

        console.log('Role :::: ', userRole);

        setUserInfo({
          userName: userName,
          role: userRole,
        })


        // console.log('Decode accessToken ::::: ');
        // console.log(jwt.decode(accessToken));
        // console.log('accessTokenExpiration ::::: ');
        // console.log(accessTokenExpiration);


        console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&res.data");
        console.log(data);

        // console.log("***********************userName");
        // console.log(data.userName);

        // const decodedToken = jwt.decode(accessToken);
        // const userRole = decodedToken.role;

        // console.log('User Role ::::');
        // console.log(userRole);


        // setData({
        //   ...data,
        //   role: userRole,
        // });

        // console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&& data after Set");
        // console.log(data);


        const message = `${data.userName} ${userInfo.role}`
        enqueueSnackbar(message, { variant: 'success' })
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
        const userRole = JSON.parse(atob(arrayToken[1])).role
        const userName = JSON.parse(atob(arrayToken[1])).userName

        console.log('Role :::: ', userRole);

        setUserInfo({
          userName: userName,
          role: userRole,
        })
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
        <div className="">
          <Circle />
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
