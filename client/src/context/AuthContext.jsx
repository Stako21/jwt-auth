import { createContext, useCallback, useEffect, useState } from "react";
import axios from "axios";
import config from "../config";
import style from "../app.module.scss";
import showErrorMessage from "../utils/showErrorMessage";
import inMemoryJWT from "../services/inMemoryJWT";
import { useSnackbar } from "notistack";

export const AuthClient = axios.create({
  baseURL: `${config.API_URL}/auth`,
  withCredentials: true,
});

AuthClient.interceptors.request.use(
  (requestConfig) => {
    const accessToken = inMemoryJWT.getToken();

    if (accessToken) {
      requestConfig.headers["Authorization"] = `Bearer ${accessToken}`;
    }

    return requestConfig;
  },
  (error) => Promise.reject(error),
);

export const AuthContext = createContext({});

const serializeState = (value) => JSON.stringify(value ?? null);

const AuthProvider = ({ children }) => {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isUserLogged, setIsUserLogged] = useState(false);
  const [userInfo, setUserInfo] = useState();
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

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

  const mergeUserInfo = useCallback((patch) => {
    setUserInfo((prev) => {
      const nextPatch = typeof patch === "function" ? patch(prev) : patch;
      const next = {
        ...(prev || {}),
        ...(nextPatch || {}),
      };

      if (
        prev &&
        prev.userName === next.userName &&
        prev.role === next.role &&
        prev.city === next.city &&
        prev.branchId === next.branchId &&
        prev.userID === next.userID &&
        prev.id === next.id &&
        prev.displayName === next.displayName &&
        serializeState(prev.currentBranch) === serializeState(next.currentBranch) &&
        serializeState(prev.availableBranches) ===
          serializeState(next.availableBranches)
      ) {
        return prev;
      }

      return next;
    });
  }, []);

  const clearAuthState = useCallback(() => {
    inMemoryJWT.deleteToken();
    setUserInfo(undefined);
    setIsUserLogged(false);
  }, []);

  const resetAuthState = useCallback(() => {
    inMemoryJWT.deleteToken(false);
    setUserInfo(undefined);
    setIsUserLogged(false);
  }, []);

  const hasStoredAuthSession = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return localStorage.getItem(config.AUTH_SESSION_STORAGE_KEY) === "1";
  }, []);

  const applyTokenUser = useCallback((accessToken) => {
    const decoded = decodeJwtPayload(accessToken);

    mergeUserInfo({
      userName: decoded.userName,
      role: decoded.role,
      city: decoded.city,
      branchId: decoded.branchId ?? null,
      userID: decoded.id,
      id: decoded.id,
    });

    return decoded;
  }, [mergeUserInfo]);

  const loadMe = useCallback(async () => {
    try {
      const res = await AuthClient.get("/me");

      mergeUserInfo((prev) => ({
        displayName: res.data.displayName,
        branchId:
          res.data.currentBranchId ?? res.data.branchId ?? prev?.branchId ?? null,
        currentBranch: res.data.currentBranch || null,
        availableBranches: res.data.availableBranches || [],
      }));

      return res.data;
    } catch (error) {
      console.error("Failed to load /me", error);
      return null;
    }
  }, [mergeUserInfo]);

  const handleLogOut = (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    AuthClient.post("/logout")
      .then(() => {
        clearAuthState();
      })
      .catch((error) => showErrorMessage(enqueueSnackbar, error));
  };

  const handleSignUp = (payload) => {
    AuthClient.post("/sign-up", payload)
      .then(() => {
        enqueueSnackbar("Registration completed successfully!", {
          variant: "success",
        });
      })
      .catch((error) => showErrorMessage(enqueueSnackbar, error));
  };

  const handleSignIn = (payload) => {
    AuthClient.post("/sign-in", payload)
      .then(async (res) => {
        const { accessToken, accessTokenExpiration } = res.data;

        inMemoryJWT.setToken(accessToken, accessTokenExpiration);

        let decoded;
        try {
          decoded = applyTokenUser(accessToken);
        } catch (error) {
          showErrorMessage(enqueueSnackbar, `Invalid token: ${error.message}`);
          return;
        }

        setIsUserLogged(true);
        await loadMe();

        const message = `Welcome ${decoded.user_name || decoded.userName} (${decoded.role})`;
        enqueueSnackbar(message, { variant: "success" });
      })
      .catch((error) => {
        console.log(error);
        showErrorMessage(enqueueSnackbar, error);
      });
  };

  const handleSwitchBranch = useCallback(
    async (branchId) => {
      if (!branchId || Number(branchId) === Number(userInfo?.branchId)) {
        return;
      }

      setIsSwitchingBranch(true);

      try {
        const res = await AuthClient.post("/switch-branch", {
          branchId: Number(branchId),
        });
        const { accessToken, accessTokenExpiration } = res.data;

        inMemoryJWT.setToken(accessToken, accessTokenExpiration);
        applyTokenUser(accessToken);
        await loadMe();
        enqueueSnackbar("Branch switched successfully", { variant: "success" });
      } catch (error) {
        showErrorMessage(enqueueSnackbar, error);
        throw error;
      } finally {
        setIsSwitchingBranch(false);
      }
    },
    [applyTokenUser, enqueueSnackbar, loadMe, userInfo?.branchId],
  );

  useEffect(() => {
    if (!hasStoredAuthSession()) {
      setIsAppReady(true);
      setIsUserLogged(false);
      return;
    }

    AuthClient.post("/refresh")
      .then(async (res) => {
        const { accessToken, accessTokenExpiration } = res.data;
        inMemoryJWT.setToken(accessToken, accessTokenExpiration);

        try {
          applyTokenUser(accessToken);
        } catch (error) {
          clearAuthState();
          setIsAppReady(true);
          return;
        }

        setIsUserLogged(true);
        await loadMe();
        setIsAppReady(true);
      })
      .catch((error) => {
        clearAuthState();
        setIsAppReady(true);

        if (![401, 422].includes(error?.response?.status)) {
          console.error("Failed to restore auth session", error);
        }
      });
  }, [applyTokenUser, clearAuthState, hasStoredAuthSession, loadMe]);

  useEffect(() => {
    if (isAppReady) {
      try {
        document.body.style.overflow = null;
        document.body.style.height = null;
        document.body.style.width = null;
        document.body.style.position = null;
      } catch (error) {}
    }

    return () => {
      try {
        document.body.style.overflow = null;
        document.body.style.height = null;
        document.body.style.width = null;
        document.body.style.position = null;
      } catch (error) {}
    };
  }, [isAppReady]);

  useEffect(() => {
    const handlePersistentLogOut = (event) => {
      if (event.key === config.LOGOUT_STORAGE_KEY) {
        resetAuthState();
      }
    };

    window.addEventListener("storage", handlePersistentLogOut);
    return () => {
      window.removeEventListener("storage", handlePersistentLogOut);
    };
  }, [resetAuthState]);

  return (
    <AuthContext.Provider
      value={{
        userInfo,
        reloadUserInfo: loadMe,
        handleSignUp,
        handleSignIn,
        handleLogOut,
        handleSwitchBranch,
        isSwitchingBranch,
        isUserLogged,
        isAppReady,
      }}
    >
      {isAppReady ? (
        children
      ) : (
        <div className={style.centered}>
          <progress className="progress is-small is-primary" max="100" />
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
