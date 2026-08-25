import React, { useContext, useEffect, useRef, useState } from "react";
import FormSelect from "../FormControl/FormSelect.jsx";
import { Link, useLocation, useNavigate } from "react-router-dom";
import cn from "classnames";
import { AuthContext } from "../../context/AuthContext";
import { useAppConfig } from "../../context/AppConfigContext";
import { ROLE_IDS } from "../../utils/roles";
import { getHorizontalSwipeDirection } from "../../utils/swipeGesture";
import { UI_GESTURE } from "../../uiTokens";
import { canAccessStaticReport } from "../Reports/reportRegistry";
import style from "./header.module.scss";

const NAV_ITEMS = {
  balances: { icon: "fa-regular fa-square-minus", label: "Залишки" },
  sales: { icon: "fa-solid fa-chart-simple", label: "Продажі" },
  reports: { icon: "fa-regular fa-chart-bar", label: "Звіти" },
  documents: { icon: "fa-regular fa-file-lines", label: "Документи" },
  admin: { icon: "fa-solid fa-shield-halved", label: "Адмін" },
  settings: { icon: "fa-solid fa-gear", label: "Налаштування" },
};

function SidebarContent({
  activeBalancePages,
  accessibleStaticReports,
  canOpenSettings,
  canSwitchBranches,
  currentBalancePage,
  currentStaticReport,
  handleLinkClick,
  handleLogOut,
  handleNavigationSelect,
  handleSwitchBranch,
  isPicker,
  isSwitchingBranch,
  location,
  userInfo,
}) {
  const currentBranchId = userInfo?.currentBranch?.id || userInfo?.branchId || "";
  const userLabel = userInfo?.displayName || userInfo?.userName || "Користувач";
  const branchLabel =
    userInfo?.currentBranch?.shortName ||
    userInfo?.currentBranch?.name ||
    "Поточна філія";
  const firstBalancePath = activeBalancePages[0]
    ? `/balance/${activeBalancePages[0].slug}`
    : "/documents";

  return (
    <>
      <div className={style.sidebarIdentity}>
        <div className={style.identityMark} aria-hidden="true">
          <i className="fa-regular fa-user"></i>
        </div>
        <div className={style.identityText}>
          <p className={style.identityName}>{userLabel}</p>
          <p className={style.identityBranch}>{branchLabel}</p>
        </div>
      </div>

      <nav className={style.sidebarNav} aria-label="Головна навігація">
        {!isPicker && activeBalancePages.length > 0 ? (
          <>
            <Link
              to={firstBalancePath}
              className={cn(style.navItem, {
                [style.activeNavItem]: Boolean(currentBalancePage),
              })}
              onClick={handleLinkClick}
            >
              <i className={NAV_ITEMS.balances.icon}></i>
              <span>{NAV_ITEMS.balances.label}</span>
            </Link>

            {activeBalancePages.length > 1 ? (
              <div className={style.subNav}>
                {activeBalancePages.map((page) => {
                  const path = `/balance/${page.slug}`;
                  return (
                    <Link
                      key={page.id}
                      to={path}
                      className={cn(style.subNavItem, {
                        [style.activeSubNavItem]: location.pathname === path,
                      })}
                      onClick={handleLinkClick}
                    >
                      {page.menuTitle}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}

        {!isPicker ? (
          <Link
            to="/sales-report"
            className={cn(style.navItem, {
              [style.activeNavItem]: location.pathname === "/sales-report",
            })}
            onClick={handleLinkClick}
          >
            <i className={NAV_ITEMS.sales.icon}></i>
            <span>{NAV_ITEMS.sales.label}</span>
          </Link>
        ) : null}

        {accessibleStaticReports.length > 0 ? (
          <label
            className={cn(style.navItem, style.navSelectItem, {
              [style.activeNavItem]: Boolean(currentStaticReport),
            })}
          >
            <i className={NAV_ITEMS.reports.icon}></i>
            <FormSelect
              variant="bare"
              value={currentStaticReport?.route || ""}
              onChange={handleNavigationSelect}
              aria-label="Звіти"
            >
              <option value="">{NAV_ITEMS.reports.label}</option>
              {accessibleStaticReports.map((report) => (
                <option key={report.id} value={report.route}>
                  {report.menuTitle}
                </option>
              ))}
            </FormSelect>
          </label>
        ) : null}

        {!isPicker ? (
          <Link
            to="/documents"
            className={cn(style.navItem, {
              [style.activeNavItem]: location.pathname === "/documents",
            })}
            onClick={handleLinkClick}
          >
            <i className={NAV_ITEMS.documents.icon}></i>
            <span>{NAV_ITEMS.documents.label}</span>
          </Link>
        ) : null}

        {Number(userInfo?.role) === ROLE_IDS.Admin ? (
          <Link
            to="/admin-page"
            className={cn(style.navItem, {
              [style.activeNavItem]: location.pathname === "/admin-page",
            })}
            onClick={handleLinkClick}
          >
            <i className={NAV_ITEMS.admin.icon}></i>
            <span>{NAV_ITEMS.admin.label}</span>
          </Link>
        ) : null}

        {canOpenSettings ? (
          <label
            className={cn(style.navItem, style.navSelectItem, {
              [style.activeNavItem]: location.pathname.startsWith("/settings"),
            })}
          >
            <i className={NAV_ITEMS.settings.icon}></i>
            <FormSelect
              variant="bare"
              value={
                location.pathname === "/settings/warehouses"
                  ? "/settings/warehouses"
                  : ""
              }
              onChange={handleNavigationSelect}
              aria-label="Налаштування"
            >
              <option value="">{NAV_ITEMS.settings.label}</option>
              <option value="/settings/warehouses">Налаштування складу</option>
            </FormSelect>
          </label>
        ) : null}
      </nav>

      <div className={style.sidebarFooter}>
        {canSwitchBranches ? (
          <label className={style.drawerBranchSelect}>
            <i className="fa-regular fa-building"></i>
            <FormSelect
              variant="bare"
              value={currentBranchId}
              onChange={(event) => handleSwitchBranch(Number(event.target.value))}
              disabled={isSwitchingBranch}
              aria-label="Філія"
            >
              {(userInfo?.availableBranches || []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.shortName || branch.name}
                </option>
              ))}
            </FormSelect>
          </label>
        ) : null}

        <button className={style.logoutButton} type="button" onClick={handleLogOut}>
          <i className="fa-solid fa-arrow-right-from-bracket"></i>
          <span>Вихід</span>
        </button>
      </div>
    </>
  );
}

const Header = ({ lastUpdateTime, isOpen, setIsOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isUserLogged,
    userInfo,
    handleLogOut,
    handleSwitchBranch,
    isSwitchingBranch,
  } = useContext(AuthContext);
  const { activeBalancePages, activeReports } = useAppConfig();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const swipeGestureRef = useRef(null);

  useEffect(() => {
    document.body.classList.toggle("appShellCollapsed", isCollapsed);
    return () => document.body.classList.remove("appShellCollapsed");
  }, [isCollapsed]);

  useEffect(() => {
    document.body.classList.toggle("appDrawerOpen", isOpen);
    return () => document.body.classList.remove("appDrawerOpen");
  }, [isOpen]);

  if (!isUserLogged) return null;

  const closeMenu = () => setIsOpen(false);
  const beginSwipe = (mode, event) => {
    if (event.pointerType !== "touch") return;

    swipeGestureRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      endX: event.clientX,
      endY: event.clientY,
      cancelled: false,
      target: event.currentTarget,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveSwipe = (event) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;

    gesture.endX = event.clientX;
    gesture.endY = event.clientY;

    const horizontalDistance = Math.abs(gesture.endX - gesture.startX);
    const verticalDistance = Math.abs(gesture.endY - gesture.startY);
    if (
      verticalDistance >= UI_GESTURE.activationDistancePx &&
      verticalDistance > horizontalDistance
    ) {
      gesture.cancelled = true;
      return;
    }

    const direction = getHorizontalSwipeDirection(gesture, {
      minDistance: UI_GESTURE.activationDistancePx,
      horizontalAxisRatio: UI_GESTURE.horizontalAxisRatio,
    });
    const isExpectedDirection =
      (gesture.mode === "open" && direction === "right") ||
      (gesture.mode === "close" && direction === "left");

    if (isExpectedDirection) event.preventDefault();
  };
  const finishSwipe = (event) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gesture.endX = event.clientX;
    gesture.endY = event.clientY;
    const direction = gesture.cancelled
      ? null
      : getHorizontalSwipeDirection(gesture, {
          minDistance: UI_GESTURE.completedSwipeDistancePx,
          horizontalAxisRatio: UI_GESTURE.horizontalAxisRatio,
        });

    if (gesture.mode === "open" && direction === "right") setIsOpen(true);
    if (gesture.mode === "close" && direction === "left") setIsOpen(false);

    gesture.target?.releasePointerCapture?.(event.pointerId);
    swipeGestureRef.current = null;
  };
  const cancelSwipe = (event) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gesture.target?.releasePointerCapture?.(event.pointerId);
    swipeGestureRef.current = null;
  };
  const handleLinkClick = () => closeMenu();
  const handleNavigationSelect = (event) => {
    const route = event.target.value;
    if (!route) return;
    navigate(route);
    closeMenu();
  };

  const currentBalancePage = activeBalancePages.find(
    (page) => location.pathname === `/balance/${page.slug}`,
  );
  const accessibleStaticReports = activeReports.filter(
    (report) =>
      canAccessStaticReport(report, userInfo?.role) &&
      (Number(userInfo?.role) !== ROLE_IDS.Picker ||
        report.reportKey === "report-bill-of-lading"),
  );
  const currentStaticReport = accessibleStaticReports.find(
    (report) => location.pathname === report.route,
  );
  const isPicker = Number(userInfo?.role) === ROLE_IDS.Picker;
  const canOpenSettings =
    Number(userInfo?.role) === ROLE_IDS.Admin ||
    Number(userInfo?.role) === ROLE_IDS.Director;
  const titleByPath = {
    "/admin-page": "Адміністрування",
    "/sales-report": "Продажі",
    "/documents": "Документи",
    "/settings/warehouses": "Налаштування складу",
  };
  const headerTitle =
    currentBalancePage?.headerTitle ||
    currentStaticReport?.menuTitle ||
    titleByPath[location.pathname] ||
    "Робоча панель";
  const canSwitchBranches =
    userInfo &&
    (Number(userInfo.role) === ROLE_IDS.Admin ||
      Number(userInfo.role) === ROLE_IDS.Director) &&
    (userInfo.availableBranches?.length || 0) > 1;
  const branchLabel =
    userInfo?.currentBranch?.shortName || userInfo?.currentBranch?.name || "Філія";
  const currentBranchId = userInfo?.currentBranch?.id || userInfo?.branchId || "";
  const userLabel = userInfo?.displayName || userInfo?.userName || "";

  const sidebarProps = {
    activeBalancePages,
    accessibleStaticReports,
    canOpenSettings,
    canSwitchBranches,
    currentBalancePage,
    currentStaticReport,
    handleLinkClick,
    handleLogOut,
    handleNavigationSelect,
    handleSwitchBranch,
    isPicker,
    isSwitchingBranch,
    location,
    userInfo,
  };

  return (
    <>
      <aside className={cn(style.sidebar, { [style.collapsed]: isCollapsed })}>
        <SidebarContent {...sidebarProps} />
      </aside>

      <header className={cn(style.topbar, { [style.expanded]: isCollapsed })}>
        <button
          className={style.desktopMenuButton}
          type="button"
          onClick={() => setIsCollapsed((previous) => !previous)}
          aria-label={isCollapsed ? "Розгорнути меню" : "Згорнути меню"}
          aria-pressed={isCollapsed}
        >
          <i className="fa-solid fa-bars"></i>
        </button>

        <button
          className={style.mobileMenuButton}
          type="button"
          onClick={() => setIsOpen((previous) => !previous)}
          aria-label={isOpen ? "Закрити меню" : "Відкрити меню"}
          aria-expanded={isOpen}
        >
          <i className="fa-solid fa-bars"></i>
        </button>

        <h1 className={style.pageTitle}>{headerTitle}</h1>

        <div className={style.topbarMeta}>
          {canSwitchBranches ? (
            <label className={style.branchSelect}>
              <i className="fa-solid fa-location-dot"></i>
              <FormSelect
                variant="bare"
                value={currentBranchId}
                onChange={(event) => handleSwitchBranch(Number(event.target.value))}
                disabled={isSwitchingBranch}
                aria-label="Філія"
              >
                {(userInfo?.availableBranches || []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.shortName || branch.name}
                  </option>
                ))}
              </FormSelect>
            </label>
          ) : (
            <span className={style.metaItem}>
              <i className="fa-solid fa-location-dot"></i>
              {branchLabel}
            </span>
          )}
          <span className={style.metaItem}>
            <i className="fa-regular fa-clock"></i>
            {lastUpdateTime || "--:--"}
          </span>
          {userLabel ? <span className={style.userBadge}>{userLabel}</span> : null}
        </div>
      </header>

      {!isOpen ? (
        <div
          className={style.edgeSwipeZone}
          aria-hidden="true"
          onPointerDown={(event) => beginSwipe("open", event)}
          onPointerMove={moveSwipe}
          onPointerUp={finishSwipe}
          onPointerCancel={cancelSwipe}
        />
      ) : null}

      <button
        className={cn(style.drawerBackdrop, { [style.drawerOpen]: isOpen })}
        type="button"
        onClick={closeMenu}
        aria-label="Закрити меню"
      ></button>
      <aside
        className={cn(style.mobileDrawer, { [style.drawerOpen]: isOpen })}
        aria-hidden={!isOpen}
        onPointerDown={(event) => beginSwipe("close", event)}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
      >
        <SidebarContent {...sidebarProps} />
      </aside>
    </>
  );
};

export default Header;
