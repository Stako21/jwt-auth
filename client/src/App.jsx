import { useContext, useMemo, useState } from "react";
import { Routes, Route, BrowserRouter, Navigate } from "react-router-dom";
import SignIn from "./pages/SignIn";
import AdminPage from "./pages/AdminPage";
import DocumentsPage from "./pages/DocumentsPage";
import Header from "./components/Header/Header";
import { ParseExcel } from "./components/ParseExcel/ParseExcel";
import { AuthContext } from "./context/AuthContext";
import { SalesReport } from "./components/SalesReport/SalesReport";
import { ReportRomashka } from "./components/Reports/ReportRomashka";
import { ROLE_IDS } from "./utils/roles";
import { AppConfigProvider, useAppConfig } from "./context/AppConfigContext";

function renderBalanceRoutes(activeBalancePages, setLastUpdateTime) {
  return activeBalancePages.map((page) => (
    <Route
      key={page.id}
      path={`/balance/${page.slug}`}
      element={
        <ParseExcel
          balanceSlug={page.slug}
          setLastUpdateTime={setLastUpdateTime}
        />
      }
    />
  ));
}

function renderRomashkaRoute({
  isEnabled,
  route,
  fallbackPath,
  setLastUpdateTime,
}) {
  return (
    <Route
      path={route}
      element={
        isEnabled ? (
          <ReportRomashka setLastUpdateTime={setLastUpdateTime} />
        ) : (
          <Navigate to={fallbackPath} replace />
        )
      }
    />
  );
}

const AppContent = () => {
  const { userInfo, isUserLogged } = useContext(AuthContext);
  const { activeBalancePages, activeReports, loading: configLoading } =
    useAppConfig();
  const [lastUpdateTime, setLastUpdateTime] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const romashkaReport = activeReports.find(
    (report) => report.reportKey === "report-romashka",
  );
  const isRomashkaEnabled = Boolean(romashkaReport);
  const romashkaRoute = romashkaReport?.route || "/report-romashka";
  const isAdmin = userInfo?.role === ROLE_IDS.Admin;
  const isDirector = userInfo?.role === ROLE_IDS.Director;

  const defaultLoggedPath = useMemo(() => {
    if (isAdmin) return "/admin-page";

    const userCityPage = activeBalancePages.find(
      (page) => Number(page.cityId) === Number(userInfo?.city),
    );

    if (userCityPage) return `/balance/${userCityPage.slug}`;
    if (activeBalancePages[0]) return `/balance/${activeBalancePages[0].slug}`;
    return "/documents";
  }, [activeBalancePages, isAdmin, userInfo]);

  return (
    <>
      <Header
        lastUpdateTime={lastUpdateTime}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />

      {isUserLogged && configLoading ? (
        <progress className="progress is-small is-primary" />
      ) : (
        <Routes>
          {isUserLogged ? (
            isAdmin ? (
              <>
                <Route path="/documents" element={<DocumentsPage />} />
                <Route
                  path="/sales-report"
                  element={<SalesReport setLastUpdateTime={setLastUpdateTime} />}
                />
                {renderRomashkaRoute({
                  isEnabled: isRomashkaEnabled,
                  route: romashkaRoute,
                  fallbackPath: "/admin-page",
                  setLastUpdateTime,
                })}
                <Route path="/admin-page" element={<AdminPage />} />
                {renderBalanceRoutes(activeBalancePages, setLastUpdateTime)}
              </>
            ) : (
              <>
                {isDirector ? (
                  renderRomashkaRoute({
                    isEnabled: isRomashkaEnabled,
                    route: romashkaRoute,
                    fallbackPath: "/documents",
                    setLastUpdateTime,
                  })
                ) : null}
                <Route
                  path="/sales-report"
                  element={
                    <SalesReport
                      isOpen={isOpen}
                      setLastUpdateTime={setLastUpdateTime}
                    />
                  }
                />
                {renderBalanceRoutes(activeBalancePages, setLastUpdateTime)}
                <Route path="/documents" element={<DocumentsPage />} />
              </>
            )
          ) : (
            <Route path="sign-in" element={<SignIn />} />
          )}

          <Route
            path="*"
            element={
              <Navigate
                to={isUserLogged ? defaultLoggedPath : "/sign-in"}
                replace
              />
            }
          />
        </Routes>
      )}
    </>
  );
};

const App = () => {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppConfigProvider>
        <AppContent />
      </AppConfigProvider>
    </BrowserRouter>
  );
};

export default App;
