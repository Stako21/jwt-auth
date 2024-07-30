import { useContext, useEffect } from "react";
import { Link, Routes, Route, BrowserRouter, Navigate, useLocation } from "react-router-dom";
import { SnackbarProvider } from "notistack";
import SignUp from "./pages/SignUp";
import SignIn from "./pages/SignIn";
import Demo from "./pages/Demo";
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
  const { isUserLogged } = useContext(AuthContext);

  useEffect(() => {
    console.log(`User logged in: ${isUserLogged}`);
  }, [isUserLogged]);

  return (
    <div className={cn (style.wrapper)}>
      <SnackbarProvider />
      <BrowserRouter>
        <LogPageView />

        {!isUserLogged && (
          <nav className={cn (style.navbar)}>
            <ul className={cn (style.navbar__list)}>
              {/* <nav className={style.nav}> */}
              <li>
                <Link to="sign-in">Вход</Link>
              </li>
              <li>
                <Link to="sign-up">Регистрация</Link>
              </li>
              {/* <Link to="demo">Демо</Link> */}
            </ul>
          </nav>
        )}

        <Routes>
          {isUserLogged ? (
            <Route path="demo" element={<Demo />} />
          ) : (
            <>
              <Route path="sign-in" element={<SignIn />} />
              <Route path="sign-up" element={<SignUp />} />
            </>
          )}
          <Route path="*" element={<Navigate to={isUserLogged ? "demo" : "sign-in"} />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
};

export default App;


// import { useContext } from "react";
// import { Link, Routes, Route, BrowserRouter, Navigate } from "react-router-dom";
// import { SnackbarProvider } from "notistack";
// import SignUp from "./pages/SignUp";
// import SignIn from "./pages/SignIn";
// import Demo from "./pages/Demo";
// import style from "./app.module.scss";
// import { AuthContext } from "./context/AuthContext";

// const App = () => {
//   const { isUserLogged } = useContext(AuthContext);


//   return (
//     <div className={style.wrapper}>
//       <SnackbarProvider />
//       <BrowserRouter>
//         {!isUserLogged && (
//           <nav className={style.nav}>
//             <Link to="sign-in">Вход</Link>
//             <Link to="sign-up">Регистрация</Link>
//             {/* <Link to="demo">Демо</Link> */}
//           </nav>
//         )}
//         <Routes>
//           {isUserLogged ? (
//             <Route path="demo" element={<Demo />} />
//           ) : (
//             <>
//               <Route path="sign-in" element={<SignIn />} />
//               <Route path="sign-up" element={<SignUp />} />
//             </>
//           )

//           }
//           <Route path="*" element={<Navigate to={isUserLogged ? "demo" : "sign-in"} />} />
//         </Routes>
//       </BrowserRouter>
//     </div>
//   );
// };

// export default App;
// 13062024911
