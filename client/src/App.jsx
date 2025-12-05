import { useContext, useEffect, useState } from "react";
// import { Circle, Planets, Zoom } from "react-preloaders";
import {
  Link,
  Routes,
  Route,
  BrowserRouter,
  Navigate,
  useLocation,
} from "react-router-dom";
import { SnackbarProvider } from "notistack";
// import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import AdminPage from "./pages/AdminPage";
import Header from "./components/Header/Header";
import { ParseExcel } from "./components/ParseExcel/ParseExcel";
// import style from "./app.module.scss";
import { AuthContext } from "./context/AuthContext";
import { SalesReport } from "./components/SalesReport/SalesReport";
import { ReportRomashka } from "./components/Reports/ReportRomashka";

// const LogPageView = () => {
//   const location = useLocation();

//   useEffect(() => {}, [location]);

//   return null;
// };

const AppContent = () => {
  const { userInfo, isUserLogged } = useContext(AuthContext);
  const [lastUpdateTime, setLastUpdateTime] = useState(""); // Время обновления
  const [headerTitle, setHeaderTitle] = useState(""); // Заголовок страницы
  const [currentPath, setCurrentPath] = useState(""); // Текущий путь
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/zp") {
      setHeaderTitle("Запоріжжя");
    } else if (location.pathname === "/kr") {
      setHeaderTitle("Кривий Ріг");
    } else if (location.pathname === "/dp") {
      setHeaderTitle("Дніпро");
    } else {
      setHeaderTitle("Your Title Here");
    }
  }, [location]);

  useEffect(() => {
    if (location.pathname !== currentPath) {
      setCurrentPath(location.pathname);
    }
  }, [location.pathname, currentPath]);

  useEffect(() => {
    if (currentPath !== location.pathname) {
    }
  }, [location.pathname, currentPath]);

  return (
    // <div className={style.content}>
    <>
      <Header
        title={headerTitle}
        lastUpdateTime={lastUpdateTime}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
      />

      <Routes>
        {isUserLogged ? (
          userInfo.role === 1 ? (
            <>
              <Route path="/sales-report" element={<SalesReport />} />
              <Route
                path="/report-romashka"
                element={
                  <ReportRomashka setLastUpdateTime={setLastUpdateTime} />
                }
              />
              <Route path="/admin-page" element={<AdminPage />} />
              <Route
                path="/zp"
                element={
                  <ParseExcel
                    fileName="balanceZP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
              <Route
                path="/kr"
                element={
                  <ParseExcel
                    fileName="balanceKR.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
              <Route
                path="/dp"
                element={
                  <ParseExcel
                    fileName="balanceDP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
            </>
          ) : (
            <>
              {userInfo.role === 2 && (
                <Route
                  path="/report-romashka"
                  element={
                    <ReportRomashka setLastUpdateTime={setLastUpdateTime} />
                  }
                />
              )}
              <Route
                path="/sales-report"
                element={
                  <SalesReport
                    isOpen={isOpen}
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
              <Route
                path="/zp"
                element={
                  <ParseExcel
                    fileName="balanceZP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
              <Route
                path="/kr"
                element={
                  <ParseExcel
                    fileName="balanceKR.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
              <Route
                path="/dp"
                element={
                  <ParseExcel
                    fileName="balanceDP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                  />
                }
              />
            </>
          )
        ) : (
          <>
            <Route path="sign-in" element={<SignIn />} />
            {/* <Route path="sign-up" element={<SignUp />} /> */}
          </>
        )}
        <Route
          path="*"
          element={
            <Navigate
              to={
                isUserLogged
                  ? userInfo.role === 1
                    ? "admin-page"
                    : userInfo.city === 1
                    ? "/zp"
                    : userInfo.city === 2
                    ? "/dp"
                    : "/kr"
                  : "sign-in"
              }
            />
          }
        />
      </Routes>
    </>
    // </div>
  );
};

const App = () => {
  return (
    <SnackbarProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </SnackbarProvider>
  );
};

export default App;
