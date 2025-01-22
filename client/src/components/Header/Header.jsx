import { useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import style from "./header.module.scss"
import cn from "classnames"


const Header = () => {
  const { isUserLogged } = useContext(AuthContext);

  return (
    <header className="bd-header">

      <nav className="navbar" role="navigation" aria-label="main navigation">
        <div className="navbar-brand">
          <a role="button" className="navbar-burger" aria-label="menu" aria-expanded="false" data-target="navbarBasicExample">
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </a>
        </div>

        <div id="navbarBasicExample" className="navbar-menu">
          {!isUserLogged && (
            <>
              <div className="navbar-end">
                <div className="navbar-item">
                  {/* <nav className={style.nav}> */}
                  <div className="">
                    <Link to="sign-in" className="navbar-in-link" >Вход</Link>
                  </div>
                  <div className="">
                    <Link to="sign-up" className="navbar-up-link" >Регистрация</Link>
                  </div>
                  {/* <Link to="demo">Демо</Link> */}
                </div>
              </div>
            </>
          )}
        </div>
      </nav>
    </header>
  )
};

export default Header;
