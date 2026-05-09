import React, { useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import cn from "classnames";
import { AuthContext } from "../../context/AuthContext";
import { useAppConfig } from "../../context/AppConfigContext";
import style from "./header.module.scss";
import logo from "../../img/ST_Wight.png";
import { ROLE_IDS } from "../../utils/roles";

const Header = ({ lastUpdateTime, isOpen, setIsOpen }) => {
  const location = useLocation();
  const {
    isUserLogged,
    userInfo,
    handleLogOut,
    handleSwitchBranch,
    isSwitchingBranch,
  } = useContext(AuthContext);
  const { activeBalancePages, activeReports } = useAppConfig();
  const [isActive, setIsActive] = useState(false);

  const toggleMenu = () => {
    setIsActive((prev) => !prev);
    setIsOpen((prev) => !prev);
  };

  const handleLinkClick = () => {
    setIsActive(false);
    setIsOpen(false);
  };

  const currentBalancePage = activeBalancePages.find(
    (page) => location.pathname === `/balance/${page.slug}`,
  );
  const romashkaReport = activeReports.find(
    (report) => report.reportKey === "report-romashka",
  );
  const isRomashkaEnabled = Boolean(romashkaReport);
  const romashkaRoute = romashkaReport?.route || "/report-romashka";
  const titleByPath = {
    "/admin-page": "Адміністрування",
    "/sales-report": "Продажі",
    "/documents": "Документи",
  };
  const headerTitle =
    currentBalancePage?.headerTitle ||
    (location.pathname === romashkaRoute
      ? romashkaReport?.menuTitle
      : titleByPath[location.pathname]) ||
    "";
  const canSwitchBranches =
    userInfo &&
    (userInfo.role === ROLE_IDS.Admin ||
      userInfo.role === ROLE_IDS.Director) &&
    (userInfo.availableBranches?.length || 0) > 1;

  return (
    <header className={style.header}>
      <div className={style.logo}>
        <img src={logo} alt="img" />
      </div>

      {isUserLogged && (
        <nav className={cn(style.navPages, { [style.open]: isOpen })}>
          <ul className={style.listPages}>
            {activeBalancePages.map((page) => {
              const path = `/balance/${page.slug}`;
              return (
                <li
                  key={page.id}
                  className={cn(style.headerList, {
                    [style.activePage]: location.pathname === path,
                  })}
                >
                  <Link to={path} onClick={handleLinkClick}>
                    {page.menuTitle}
                  </Link>
                </li>
              );
            })}
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/sales-report",
              })}
            >
              <Link to="/sales-report" onClick={handleLinkClick}>
                Продажі
              </Link>
            </li>
            <li
              className={cn(style.headerList, {
                [style.activePage]: location.pathname === "/documents",
              })}
            >
              <Link to="/documents" onClick={handleLinkClick}>
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
                      <Link to="/admin-page" onClick={handleLinkClick}>
                        Адмін
                      </Link>
                    </li>
                  )}
                  {isRomashkaEnabled && (
                    <li
                      className={cn(style.headerList, {
                        [style.activePage]: location.pathname === romashkaRoute,
                      })}
                    >
                      <Link to={romashkaRoute} onClick={handleLinkClick}>
                        {romashkaReport?.menuTitle}
                      </Link>
                    </li>
                  )}
                </>
              )}
          </ul>
        </nav>
      )}

      <div className={cn(style.info, { [style.hiddenElement]: !isUserLogged })}>
        <h1 className={style.infoTitle}>{headerTitle}</h1>
        <p className={style.infoUserName}>
          {userInfo?.displayName || userInfo?.userName}
        </p>
        {canSwitchBranches ? (
          <div className={style.branchSwitcher}>
            <span className={style.branchLabel}>Філія:</span>
            <div className={cn("select is-small", style.branchSelectWrapper)}>
              <select
                className={style.branchSelect}
                value={userInfo?.currentBranch?.id || userInfo?.branchId || ""}
                onChange={(e) => handleSwitchBranch(Number(e.target.value))}
                disabled={isSwitchingBranch}
              >
                {(userInfo?.availableBranches || []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.shortName || branch.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          userInfo?.currentBranch?.name && (
            <p className={style.infoBranch}>{userInfo.currentBranch.name}</p>
          )
        )}
        <p className={style.infoUpdate}>Оновлено: {lastUpdateTime}</p>
      </div>

      <nav className={cn(style.nav, { [style.open]: isOpen })}>
        <ul className={style.listMenu}>
          {!isUserLogged ? null : (
            <li>
              <a href="" onClick={handleLogOut}>
                Вихід
              </a>
            </li>
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
