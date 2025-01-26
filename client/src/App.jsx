import { useContext, useEffect } from "react";
import { Link, Routes, Route, BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { SnackbarProvider } from "notistack";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import Demo from "./pages/Demo";
import AdminPage from "./pages/AdminPage";
import Header from "./components/Header/Header";
import style from "./app.module.scss";
import { AuthContext } from "./context/AuthContext";
import cn from "classnames"

const LogPageView = () => {
  const location = useLocation();

  useEffect(() => {
    console.log(`Visited page: ${location.pathname}`);
  }, [location]);

  return null;
};

const App = () => {
  const { userInfo, isUserLogged } = useContext(AuthContext);
  // const userRole = userInfo.role;

  useEffect(() => {
    console.log(`User logged in: ${isUserLogged}`);
    console.log(`User info.role :::: ${userInfo}`);
  }, [isUserLogged]);

  return (
    <div className="">
      <SnackbarProvider />
      <BrowserRouter>
        <LogPageView />
        <Header />
        <div className={style.content}>
          <Routes>
            {isUserLogged ? (
              // <Route path="demo" element={<Demo />} />
              userInfo.role === 1 ? (
                <Route path="admin-page" element={<AdminPage />} />
              ) : (
                <Route path="demo" element={<Demo />} />
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
      </BrowserRouter>
    </div>
  );
};

export default App;
