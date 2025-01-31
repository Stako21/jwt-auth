import { useContext, useEffect, useState } from "react";
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
import cn from "classnames";

const LogPageView = () => {
  const location = useLocation();

  useEffect(() => {
    console.log(`Visited page: ${location.pathname}`);
  }, [location]);

  return null;
};

const AppContent = () => {
  const { userInfo, isUserLogged } = useContext(AuthContext);
  const [lastUpdateTime, setLastUpdateTime] = useState(""); // Состояние для времени обновления
  const [headerTitle, setHeaderTitle] = useState(""); // Состояние для заголовка
  const location = useLocation();

  useEffect(() => {
    console.log(`User logged in: ${isUserLogged}`);
    console.log(`User info.role :::: ${userInfo}`);
  }, [isUserLogged]);

  useEffect(() => {
    if (location.pathname === "/zp") {
      setHeaderTitle("Запоріжжя");
    } else if (location.pathname === "/kr") {
      setHeaderTitle("Кривий Ріг");
    } else if (location.pathname === "/dp") {
      setHeaderTitle("Дніпро");
    } else {
      setHeaderTitle("Your Title Here"); // Заголовок по умолчанию
    }
  }, [location]);

  return (
    <div className={style.content}>
      <LogPageView />
      <Header title={headerTitle} lastUpdateTime={lastUpdateTime} />
      <Routes>
        {isUserLogged ? (
          userInfo.role === 1 ? (
            <>
              <Route path="admin-page" element={<AdminPage />} />
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
              <Route path="demo" element={<Demo />} />
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
            <Route path="sign-up" element={<SignUp />} />
          </>
        )}
        <Route path="*" element={<Navigate to={isUserLogged ? (userInfo.role === 1 ? "admin-page" : "demo") : "sign-in"} />} />
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

