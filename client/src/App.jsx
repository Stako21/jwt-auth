import { useContext, useMemo, useState } from "react";
import { Routes, Route, BrowserRouter, Navigate } from "react-router-dom";
import SignIn from "./pages/SignIn";
import AdminPage from "./pages/AdminPage";
import DocumentsPage from "./pages/DocumentsPage";
import Header from "./components/Header/Header";
import { ParseExcel } from "./components/ParseExcel/ParseExcel";
import { AuthContext } from "./context/AuthContext";
import { SalesReport } from "./components/SalesReport/SalesReport";
import { ROLE_IDS } from "./utils/roles";
import { AppConfigProvider, useAppConfig } from "./context/AppConfigContext";
import {
  canAccessStaticReport,
  getReportComponent,
} from "./components/Reports/reportRegistry";
import SettingsPage from "./pages/SettingsPage";
import { DataLoader } from "./components/DataLoader/DataLoader";

function renderBalanceRoutes(activeBalancePages, setLastUpdateTime) {
  return activeBalancePages.map((page) => (
    <Route
      key={page.id}
      path={`/balance/${page.slug}`}
      element={
        <ParseExcel
          balanceSlug={page.slug}
          priceMultiplierPercent={page.priceMultiplierPercent}
          setLastUpdateTime={setLastUpdateTime}
        />
      }
    />
  ));
}

function renderStaticReportRoutes(activeReports, setLastUpdateTime) {
  return activeReports.map((report) => {
    const ReportComponent = getReportComponent(report);

    if (!ReportComponent) {
      return null;
    }

    return (
      <Route
        key={report.id}
        path={report.route}
        element={
          <ReportComponent
            report={report}
            setLastUpdateTime={setLastUpdateTime}
          />
        }
      />
    );
  });
}

const AppContent = () => {
  const { userInfo, isUserLogged } = useContext(AuthContext);
  const { activeBalancePages, activeReports, loading: configLoading } =
    useAppConfig();
  const [lastUpdateTime, setLastUpdateTime] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const accessibleStaticReports = activeReports.filter(
    (report) =>
      canAccessStaticReport(report, userInfo?.role) &&
      (Number(userInfo?.role) !== ROLE_IDS.Picker ||
        report.reportKey === "report-bill-of-lading"),
  );
  const isAdmin = userInfo?.role === ROLE_IDS.Admin;
  const isDirector = userInfo?.role === ROLE_IDS.Director;
  const isPicker = userInfo?.role === ROLE_IDS.Picker;

  const defaultLoggedPath = useMemo(() => {
    if (isAdmin) return "/admin-page";
    if (isPicker) return "/bill-of-lading";

    const userCityPage = activeBalancePages.find(
      (page) => Number(page.cityId) === Number(userInfo?.city),
    );

    if (userCityPage) return `/balance/${userCityPage.slug}`;
    if (activeBalancePages[0]) return `/balance/${activeBalancePages[0].slug}`;
    return "/documents";
  }, [activeBalancePages, isAdmin, isPicker, userInfo]);

  return (
    <>
      <Header
        lastUpdateTime={lastUpdateTime}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />

      {isUserLogged && configLoading ? (
        <DataLoader label="Завантаження конфігурації…" fullPage />
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
                {renderStaticReportRoutes(accessibleStaticReports, setLastUpdateTime)}
                <Route path="/admin-page" element={<AdminPage />} />
                <Route path="/settings/*" element={<SettingsPage />} />
                {renderBalanceRoutes(activeBalancePages, setLastUpdateTime)}
              </>
            ) : isPicker ? (
              <>{renderStaticReportRoutes(accessibleStaticReports, setLastUpdateTime)}</>
            ) : (
              <>
                {renderStaticReportRoutes(accessibleStaticReports, setLastUpdateTime)}
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
                {isDirector ? (
                  <Route path="/settings/*" element={<SettingsPage />} />
                ) : null}
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
