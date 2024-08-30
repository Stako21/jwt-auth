import { useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import style from "./header.module.scss"
import cn from "classnames"


const Header = () => {
  const { isUserLogged } = useContext(AuthContext);

  return (
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
                <div className="buttons">
                  <Link to="sign-in" className="button is-light" >Вход</Link>
                </div>
                <div className="buttons">
                  <Link to="sign-up" className="button is-light" >Регистрация</Link>
                </div>
                {/* <Link to="demo">Демо</Link> */}
              </div>
            </div>
          </>
        )}
      </div>
    </nav>
  )
};

export default Header;
