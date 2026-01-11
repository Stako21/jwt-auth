import { createContext, useState, useEffect } from "react";
import axios from "axios";
import { Circle, Planets, Zoom } from "react-preloaders";
import config from "../config";
import style from "../app.module.scss";
import showErrorMessage from "../utils/showErrorMessage";
import inMemoryJWT from "../services/inMemoryJWT";
import { useSnackbar } from "notistack";

export const AuthClient = axios.create({
  baseURL: `${config.API_URL}/auth`,
  withCredentials: true,
});

// Attach access token to auth requests when available
AuthClient.interceptors.request.use(
  (config) => {
    const accessToken = inMemoryJWT.getToken();

    if (accessToken) {
      config.headers["Authorization"] = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

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
  const { enqueueSnackbar } = useSnackbar();

  // Decode JWT payload (base64url-safe)
  const decodeJwtPayload = (token) => {
    if (!token) throw new Error("Missing token");
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid token structure");

    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad) payload += "=".repeat(4 - pad);

    try {
      const json = atob(payload);
      return JSON.parse(json);
    } catch (err) {
      throw new Error("Invalid token payload");
    }
  };


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

        let decoded;
        try {
          decoded = decodeJwtPayload(accessToken);
        } catch (e) {
          showErrorMessage(enqueueSnackbar, `Invalid token: ${e.message}`);
          return;
        }

        setUserInfo({
          userName: decoded.userName,
          // userNameRaw: decoded.userName,
          role: decoded.role,
          city: decoded.city,
          userID: decoded.id,
        });

        // Only mark user as logged in after userInfo is set to avoid race conditions
        setIsUserLogged(true);

        const message = `Welcome ${decoded.user_name || decoded.userName} (${
          decoded.role
        })`;
        enqueueSnackbar(message, { variant: "success" });
      })
      .catch((error) => {
        console.log(error);

        showErrorMessage(enqueueSnackbar, error);
      });
  };

  const loadMe = async () => {
    try {
      const res = await AuthClient.get("/me");

      setUserInfo((prev) => ({
        ...prev,
        displayName: res.data.displayName,
      }));
    } catch (e) {
      console.error("Failed to load /me", e);
    }
  };

  useEffect(() => {
    AuthClient.post("/refresh")
      .then((res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);

        let decoded;
        try {
          decoded = decodeJwtPayload(accessToken);
        } catch (e) {
          inMemoryJWT.deleteToken();
          setIsUserLogged(false);
          setIsAppReady(true);
          return;
        }

        setUserInfo({
          userName: decoded.userName,
          // userNameRaw: decoded.userName,
          role: decoded.role,
          city: decoded.city,
          userID: decoded.id,
        });

        setIsUserLogged(true);
        setIsAppReady(true);
      })
      .catch(() => {
        setIsAppReady(true);
        setIsUserLogged(false);
      });
  }, []);

  // Clean up any inline body styles that a preloader may have injected
  // (some preloader libraries set document.body.style.overflow/height/position)
  useEffect(() => {
    if (isAppReady) {
      try {
        document.body.style.overflow = null;
        document.body.style.height = null;
        document.body.style.width = null;
        document.body.style.position = null;
      } catch (e) {
        // ignore (server-side rendering or restricted environment)
      }
    }

    // also ensure cleanup on unmount
    return () => {
      try {
        document.body.style.overflow = null;
        document.body.style.height = null;
        document.body.style.width = null;
        document.body.style.position = null;
      } catch (e) {}
    };
  }, [isAppReady]);

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
    };
  }, []);

  useEffect(() => {
    if (isUserLogged) {
      loadMe();
    }
  }, [isUserLogged]);

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
