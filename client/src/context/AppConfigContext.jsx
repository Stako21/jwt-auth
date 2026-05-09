import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthContext } from "./AuthContext";
import { fetchAppConfig } from "../services/config.api";

const AppConfigContext = createContext({
  appConfig: null,
  cities: [],
  activeCities: [],
  balancePages: [],
  activeBalancePages: [],
  reports: [],
  activeReports: [],
  loading: false,
  reloadConfig: () => {},
});

export function AppConfigProvider({ children }) {
  const { isUserLogged, userInfo } = useContext(AuthContext);
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!isUserLogged) {
      setAppConfig(null);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchAppConfig();
      setAppConfig(data);
    } catch (error) {
      console.error("Failed to load app config:", error);
      setAppConfig(null);
    } finally {
      setLoading(false);
    }
  }, [isUserLogged, userInfo?.branchId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const value = useMemo(() => {
    const cities = appConfig?.cities || [];
    const balancePages = appConfig?.balancePages || [];
    const reports = appConfig?.reports || [];

    return {
      appConfig,
      cities,
      activeCities: cities.filter((city) => Boolean(city.isActive)),
      balancePages,
      activeBalancePages: balancePages.filter((page) => Boolean(page.isActive)),
      reports,
      activeReports: reports.filter((report) => Boolean(report.isActive)),
      loading,
      reloadConfig: loadConfig,
    };
  }, [appConfig, loading, loadConfig]);

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
