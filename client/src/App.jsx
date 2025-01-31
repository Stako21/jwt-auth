import { useContext, useEffect, useState } from "react";
import { Circle, Planets, Zoom } from "react-preloaders";
import { Link, Routes, Route, BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { SnackbarProvider } from "notistack";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import Demo from "./pages/Demo";
import AdminPage from "./pages/AdminPage";
import Header from "./components/Header/Header";
import { ParseExcel } from "./components/ParseExcel/ParseExcel";
import style from "./app.module.scss";
import { AuthContext } from "./context/AuthContext";

const LogPageView = () => {
  const location = useLocation();

  useEffect(() => {
    console.log(`Visited page: ${location.pathname}`);
  }, [location]);

  return null;
};

const AppContent = () => {
  const { userInfo, isUserLogged } = useContext(AuthContext);
  const [lastUpdateTime, setLastUpdateTime] = useState(""); // Время обновления
  const [headerTitle, setHeaderTitle] = useState(""); // Заголовок страницы
  const [loading, setLoading] = useState(false); // Состояние загрузки
  const [currentPath, setCurrentPath] = useState(""); // Текущий путь
  const location = useLocation();

  console.log("########loading#########", loading);
  console.log("!!!!Path changed:", location.pathname);
  console.log("!!!!Current path:", currentPath);

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

  console.log("###setLoading:", loading);

  useEffect(() => {
    if (location.pathname !== currentPath) {
      console.log("Path changed:", location.pathname);
      setLoading(true);
      setCurrentPath(location.pathname);
    }
  }, [location.pathname, currentPath]);

  console.log("!!!setLoading:", loading);

  useEffect(() => {
    if (!loading && currentPath !== location.pathname) {
      setLoading(true);
    }
  }, [loading, location.pathname, currentPath]);

  useEffect(() => {
    console.log("Loading finished effect: ", !loading);
    if (!loading) {
      console.log("Loading finished");
    }
  }, [loading]);

  return (
    <div className={style.content}>
      <LogPageView />
      <Header title={headerTitle} lastUpdateTime={lastUpdateTime} setLoading={setLoading} />
      {loading && (
        <div className={style.centered}>
          <Zoom />
        </div>
      )}
      {console.log("!!!!!!!loading!!!!!!!!", loading)}
      <Routes>
        {isUserLogged ? (
          userInfo.role === 1 ? (
            <>
              <Route path="/admin-page" element={<AdminPage setLoading={setLoading} />} />
              <Route
                path="/zp"
                element={
                  <ParseExcel
                    fileName="balanceZP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                    setLoading={setLoading}
                  />
                }
              />
              <Route
                path="/kr"
                element={
                  <ParseExcel
                    fileName="balanceKR.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                    setLoading={setLoading}
                  />
                }
              />
              <Route
                path="/dp"
                element={
                  <ParseExcel
                    fileName="balanceDP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                    setLoading={setLoading}
                  />
                }
              />
            </>
          ) : (
            <>
              <Route path="demo" element={<Demo />} />
              <Route
                path="/zp"
                element={
                  <ParseExcel
                    fileName="balanceZP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                    setLoading={setLoading}
                  />
                }
              />
              <Route
                path="/kr"
                element={
                  <ParseExcel
                    fileName="balanceKR.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                    setLoading={setLoading}
                  />
                }
              />
              <Route
                path="/dp"
                element={
                  <ParseExcel
                    fileName="balanceDP.xlsx"
                    setLastUpdateTime={setLastUpdateTime}
                    setLoading={setLoading}
                  />
                }
              />
            </>
          )
        ) : (
          <>
            <Route path="sign-in" element={<SignIn setLoading={setLoading} />} />
            <Route path="sign-up" element={<SignUp setLoading={setLoading} />} />
          </>
        )}
        <Route
          path="*"
          element={
            <Navigate to={isUserLogged ? (userInfo.role === 1 ? "admin-page" : "demo") : "sign-in"} />
          }
        />
      </Routes>
    </div>
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
