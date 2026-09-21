import React, { useEffect, useState } from "react";
import FormInput from "../components/FormControl/FormInput.jsx";
import { AuthClient } from "../context/AuthContext";
import { useSnackbar } from "notistack";
import { UsersList } from "../components/UsersList/UsersList";
import { Sidebar } from "../components/Sidebar/Sidebar";
import { RegionNotifications } from "../components/RegionNotifications/RegionNotifications";
import { BranchConfig } from "../components/Configuration/BranchConfig";
import { CitiesConfig } from "../components/Configuration/CitiesConfig";
import { BalancePagesConfig } from "../components/Configuration/BalancePagesConfig";
import { ReportsConfig } from "../components/Configuration/ReportsConfig";
import { ImportSourcesConfig } from "../components/Configuration/ImportSourcesConfig";
import { SchedulerConfig } from "../components/Configuration/SchedulerConfig";
import ScrollToTopButton from "../components/ScrollToTopButton/ScrollToTopButton";
import ThemeSelector from "../components/ThemeSelector/ThemeSelector.jsx";
import { IntegrationAccounts } from "../components/IntegrationAccounts/IntegrationAccounts.jsx";
import { WarehouseDashboardAccounts } from "../components/WarehouseDashboardAccounts/WarehouseDashboardAccounts.jsx";
import "../components/Configuration/configurationCompact.css";
import style from "./AdminPage.module.scss";

const ADMIN_PAGE_TAB_STORAGE_KEY = "admin-page-active-tab";
const ADMIN_CONFIG_SECTION_STORAGE_KEY = "admin-page-config-section";
const DEFAULT_ADMIN_TAB = "users";
const DEFAULT_CONFIG_SECTION = "branches";
const ALLOWED_ADMIN_TABS = new Set([
  "users",
  "settings",
  "scheduler",
  "configuration",
  "integration-accounts",
  "warehouse-dashboards",
]);
const CONFIGURATION_SECTIONS = [
  ["branches", "Філії"],
  ["cities", "Міста"],
  ["balances", "Сторінки залишків"],
  ["reports", "Звіти"],
  ["imports", "Імпорт"],
  ["scheduler", "Планувальник"],
];
const ALLOWED_CONFIG_SECTIONS = new Set(
  CONFIGURATION_SECTIONS.map(([section]) => section),
);

function getStoredAdminTab() {
  if (typeof window === "undefined") {
    return DEFAULT_ADMIN_TAB;
  }

  const storedTab = window.localStorage.getItem(ADMIN_PAGE_TAB_STORAGE_KEY);
  return ALLOWED_ADMIN_TABS.has(storedTab) ? storedTab : DEFAULT_ADMIN_TAB;
}

function getStoredConfigSection() {
  if (typeof window === "undefined") return DEFAULT_CONFIG_SECTION;

  const storedSection = window.localStorage.getItem(
    ADMIN_CONFIG_SECTION_STORAGE_KEY,
  );
  return ALLOWED_CONFIG_SECTIONS.has(storedSection)
    ? storedSection
    : DEFAULT_CONFIG_SECTION;
}

export default function AdminPage() {
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState(getStoredAdminTab);
  const [activeConfigSection, setActiveConfigSection] = useState(
    getStoredConfigSection,
  );

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== "users") {
      setPasswordUserId(null);
      setEditUser(null);
      setNewUserModalOpen(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ADMIN_PAGE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      ADMIN_CONFIG_SECTION_STORAGE_KEY,
      activeConfigSection,
    );
  }, [activeConfigSection]);

  const { enqueueSnackbar } = useSnackbar();

  const handlePasswordChange = async () => {
    if (!passwordUserId || !newPassword) {
      enqueueSnackbar("Поле нового пароля порожнє", { variant: "error" });
      return;
    }

    try {
      await AuthClient.put(`/users/${passwordUserId}/password`, { newPassword });
      enqueueSnackbar("Пароль успішно змінено", { variant: "success" });

      setNewPassword("");
      setPasswordUserId(null);
    } catch (error) {
      enqueueSnackbar("Помилка під час зміни пароля", { variant: "error" });
      console.error("Error updating password:", error);
    }
  };

  const onCancel = () => {
    setPasswordUserId(null);
    setEditUser(null);
    setNewPassword("");
  };

  const closeSidebar = () => {
    setEditUser(null);
    setNewUserModalOpen(false);
  };

  return (
    <main className={`${style.adminPage} admin-theme`}>
      <ThemeSelector />
      <nav className={style.tabBar} aria-label="Розділи адміністрування">
        {[
          ["users", "Користувачі", "fa-users"],
          ["settings", "Сповіщення", "fa-bell"],
          ["scheduler", "Планувальник", "fa-clock"],
          ["configuration", "Конфігурація", "fa-sliders"],
          ["integration-accounts", "Технічні записи", "fa-key"],
          ["warehouse-dashboards", "Складські екрани", "fa-tv"],
        ].map(([tab, label, icon]) => (
          <button
            key={tab}
            type="button"
            className={`${style.tabButton} ${
              activeTab === tab ? style.activeTab : ""
            }`}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => handleTabChange(tab)}
          >
            <i className={`fa-solid ${icon}`} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className={style.content}>
        {activeTab === "users" && (
          <>
          {(editUser || newUserModalOpen) && (
            <Sidebar
              user={editUser}
              onSaved={() => {
                closeSidebar();
                setUsersReloadKey((k) => k + 1);
              }}
              onCancel={closeSidebar}
            />
          )}

          {passwordUserId && (
            <div className="modal is-active admin-modal">
              <div className="modal-background"></div>
              <div className="modal-card">
                <header className="modal-card-head">
                  <p className="modal-card-title has-text-weight-medium">
                    Змінити пароль користувача ID: {passwordUserId}
                  </p>
                </header>
                <div className="modal-card-body">
                  <div className="field">
                    <FormInput
                      className="input"
                      type="text"
                      placeholder="Введіть новий пароль"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <div className="buttons">
                      <button
                        onClick={handlePasswordChange}
                        className="button is-primary is-dark is-fullwidth"
                      >
                        Змінити пароль
                      </button>
                      <button
                        className="button is-danger is-dark is-fullwidth"
                        // style={{ marginLeft: 8 }}
                        onClick={() => onCancel && onCancel()}
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <UsersList
            onPasswordChange={setPasswordUserId}
            onEditUser={(u) => setEditUser(u)}
            onCreateUser={() => setNewUserModalOpen(true)}
            key={usersReloadKey}
          />
          </>
        )}

        {activeTab === "settings" && (
          <div className={style.panelInset}>
            <RegionNotifications />
          </div>
        )}

        {activeTab === "scheduler" && (
          <div className="configuration-compact">
            <SchedulerConfig title="Ручний запуск планувальника" />
          </div>
        )}

        {activeTab === "configuration" && (
          <div className={style.configurationWorkspace}>
            <nav
              className={style.configTabs}
              aria-label="Розділи конфігурації"
            >
              {CONFIGURATION_SECTIONS.map(([section, label]) => (
                <button
                  key={section}
                  type="button"
                  className={
                    activeConfigSection === section ? style.activeConfigTab : ""
                  }
                  aria-current={
                    activeConfigSection === section ? "page" : undefined
                  }
                  onClick={() => setActiveConfigSection(section)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="configuration-compact">
              {activeConfigSection === "branches" && <BranchConfig />}
              {activeConfigSection === "cities" && <CitiesConfig />}
              {activeConfigSection === "balances" && <BalancePagesConfig />}
              {activeConfigSection === "reports" && <ReportsConfig />}
              {activeConfigSection === "imports" && <ImportSourcesConfig />}
              {activeConfigSection === "scheduler" && (
                <SchedulerConfig title="Планувальник" />
              )}
            </div>
          </div>
        )}

        {activeTab === "integration-accounts" && <IntegrationAccounts />}
        {activeTab === "warehouse-dashboards" && <WarehouseDashboardAccounts />}
      </section>

      <ScrollToTopButton />
    </main>
  );
}
