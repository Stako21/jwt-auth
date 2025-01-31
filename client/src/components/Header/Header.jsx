import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import Button from "../Button/Button";
import style from "./header.module.scss"
import cn from "classnames"
import logo from "../../img/ST_Wight.png"


const Header = () => {
  const location = useLocation();
  const { isUserLogged } = useContext(AuthContext);
  const { userInfo, handleLogOut } = useContext(AuthContext);
  const [isActive, setIsActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => {
    setIsActive((prev) => !prev);
    setIsOpen((prev) => !prev);
  };

  

  

  console.log("Ререндер Header", location.pathname);


  return (
    <header className={style.header}>

      <div className={style.logo}>
        {/* <span>ST</span> */}
        <img src={logo} alt="img" />
      </div>

      {isUserLogged && (
        <nav className={style.navPages}>
          <ul className={style.listPages}>
            <li className={location.pathname === "/zp" ? style.activePage : ""}>
              <Link to="/zp">ЗП</Link>
            </li>
            <li className={location.pathname === "/kr" ? style.activePage : ""}>
              <Link to="/kr">КР</Link>
            </li>
            <li className={location.pathname === "/dp" ? style.activePage : ""}>
              <Link to="/dp">ДП</Link>
            </li>
            {userInfo.role === 1 && (
              <li className={location.pathname === "/admin-page" ? style.activePage : ""}>
                <Link to="/admin-page">Admin</Link>
              </li>
            )}
          </ul>
        </nav>
      )}

      <nav className={cn(style.nav, { [style.open]: isOpen })}>
        <ul className={style.listMenu}>
          {!isUserLogged ? (
            <>
              <li><Link to="sign-in" className="">Вхід</Link></li>
              <li><Link to="sign-up" className="">Реєстрація</Link></li>
            </>
          ) : (
            <>
              <li >
                <a href="" onClick={handleLogOut}>Вихід</a>
                {/* <Button onClick={handleLogOut}>Log Out</Button> */}
              </li>
            </>
          )}
        </ul>
      </nav>

      <div className={cn(style.burger, { [style.active]: isActive })} onClick={toggleMenu}>
        <span></span>
      </div>

    </header>
  )
};

export default Header;
