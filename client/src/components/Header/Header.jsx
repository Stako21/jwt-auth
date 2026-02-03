import React from "react";
import { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import style from "./header.module.scss";
import cn from "classnames";
import logo from "../../img/ST_Wight.png";
import { ROLE_IDS, ROLE_LABELS } from "../../utils/roles";

const Header = ({ lastUpdateTime, isOpen, setIsOpen }) => {
  const location = useLocation();
  const { isUserLogged } = useContext(AuthContext);
  const { userInfo, handleLogOut } = useContext(AuthContext);
  const [isActive, setIsActive] = useState(false);
  // const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsActive((prev) => !prev);
    setIsOpen((prev) => !prev);
  };

  const handleLinkClick = (path) => {
    setIsActive(false);
    setIsOpen(false);
  };

  return (
    <header className={style.header}>
      <div className={style.logo}>
        <img src={logo} alt="img" />
      </div>

      {isUserLogged && (
        <nav className={cn(style.navPages, { [style.open]: isOpen })}>
          <ul className={style.listPages}>
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/zp",
              })}
            >
              <Link to="/zp" onClick={() => handleLinkClick("/zp")}>
                ЗП
              </Link>
            </li>
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/kr",
              })}
            >
              <Link to="/kr" onClick={() => handleLinkClick("/kr")}>
                КР
              </Link>
            </li>
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/dp",
              })}
            >
              <Link to="/dp" onClick={() => handleLinkClick("/dp")}>
                ДП
              </Link>
            </li>
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/sales-report",
              })}
            >
              <Link
                to="/sales-report"
                onClick={() => handleLinkClick("/sales-report")}
              >
                Продажі
              </Link>
            </li>
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/documents",
              })}
            >
              <Link
                to="/documents"
                onClick={() => handleLinkClick("/documents")}
              >
                Документи
              </Link>
            </li>

            {userInfo &&
              (userInfo.role === ROLE_IDS.Admin ||
                userInfo.role === ROLE_IDS.Director) && (
                <>
                  {userInfo.role === ROLE_IDS.Admin && (
                    <li
                      className={cn(style.headerList, {
                        [style.activePage]: location.pathname === "/admin-page",
                      })}
                    >
                      <Link
                        to="/admin-page"
                        onClick={() => handleLinkClick("/admin-page")}
                      >
                        Admin
                      </Link>
                    </li>
                  )}
                  <li
                    className={cn(style.headerList, {
                      [style.activePage]:
                        location.pathname === "/report-romashka",
                    })}
                  >
                    <Link
                      to="/report-romashka"
                      onClick={() => handleLinkClick("/report-romashka")}
                    >
                      Звіт Ромашка
                    </Link>
                  </li>
                </>
              )}
          </ul>
        </nav>
      )}
      <div className={cn(style.info, { [style.hiddenElement]: !isUserLogged })}>
        <h1 className={style.infoTitle}>
          {location.pathname === "/zp"
            ? "Запоріжжя"
            : location.pathname === "/kr"
              ? "Кривий Ріг"
              : location.pathname === "/dp"
                ? "Дніпро"
                : "Admin Page"}
        </h1>
        <p className={style.infoUserName}>
          {userInfo?.displayName || userInfo?.userName}
        </p>
        <p className={style.infoUpdate}>Оновлено: {lastUpdateTime}</p>
      </div>

      <nav className={cn(style.nav, { [style.open]: isOpen })}>
        <ul className={style.listMenu}>
          {!isUserLogged ? (
            <>
              {/* <li><Link to="sign-in" className="">Вхід</Link></li> */}
              {/* <li><Link to="sign-up" className="">Реєстрація</Link></li> */}
            </>
          ) : (
            <>
              <li>
                <a href="" onClick={handleLogOut}>
                  Вихід
                </a>
              </li>
            </>
          )}
        </ul>
      </nav>

      <div
        className={cn(
          style.burger,
          { [style.active]: isActive },
          { [style.hiddenElement]: !isUserLogged },
        )}
        onClick={toggleMenu}
      >
        <span></span>
      </div>
    </header>
  );
};

export default Header;
