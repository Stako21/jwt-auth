import React, { useEffect, useState } from "react";
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
import "../components/Configuration/configurationCompact.css";

const ADMIN_PAGE_TAB_STORAGE_KEY = "admin-page-active-tab";
const DEFAULT_ADMIN_TAB = "users";
const ALLOWED_ADMIN_TABS = new Set([
  "users",
  "settings",
  "scheduler",
  "configuration",
]);

function getStoredAdminTab() {
  if (typeof window === "undefined") {
    return DEFAULT_ADMIN_TAB;
  }

  const storedTab = window.localStorage.getItem(ADMIN_PAGE_TAB_STORAGE_KEY);
  return ALLOWED_ADMIN_TABS.has(storedTab) ? storedTab : DEFAULT_ADMIN_TAB;
}

export default function AdminPage() {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState(getStoredAdminTab);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== "users") {
      setSelectedUserId(null);
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

  const handleTabClick = (event, tab) => {
    event.preventDefault();
    handleTabChange(tab);
  };

  const { enqueueSnackbar } = useSnackbar();

  const handlePasswordChange = async () => {
    if (!selectedUserId || !newPassword) {
      enqueueSnackbar("Поле нового пароля порожнє", { variant: "error" });
      return;
    }

    try {
      await AuthClient.put(`/users/${selectedUserId}/password`, { newPassword });
      enqueueSnackbar("Пароль успішно змінено", { variant: "success" });

      setNewPassword("");
      setSelectedUserId(null);
    } catch (error) {
      enqueueSnackbar("Помилка під час зміни пароля", { variant: "error" });
      console.error("Error updating password:", error);
    }
  };

  const onCancel = () => {
    setSelectedUserId(null);
    setEditUser(null);
    setNewPassword("");
  };

  const closeSidebar = () => {
    setEditUser(null);
    setNewUserModalOpen(false);
  };

  return (
    <div className="container" style={{ minHeight: "100vh" }}>
      {/* <div className={style.adpWrapperTitle}>"
        <h1>Administrator Page</h1>
        <div className={style.adpWrapperTitleUserInfo}>
          <p>Your name: {userInfo.userName}</p>
          <p>Your role: {userInfo.role === 1 ? "admin" : "user"}</p>
        </div>
      </div> */}

      <div
        className="tabs is-centered is-boxed"
        style={{ marginTop: 10, marginBottom: 0 }}
      >
        <ul>
          <li className={activeTab === "users" ? "is-active" : ""}>
            <a href="#users" onClick={(event) => handleTabClick(event, "users")}>
              Користувачі
            </a>
          </li>
          <li className={activeTab === "settings" ? "is-active" : ""}>
            <a
              href="#settings"
              onClick={(event) => handleTabClick(event, "settings")}
            >
              Сповіщення
            </a>
          </li>
          <li className={activeTab === "scheduler" ? "is-active" : ""}>
            <a
              href="#scheduler"
              onClick={(event) => handleTabClick(event, "scheduler")}
            >
              Планувальник
            </a>
          </li>
          <li className={activeTab === "configuration" ? "is-active" : ""}>
            <a
              href="#configuration"
              onClick={(event) => handleTabClick(event, "configuration")}
            >
              Конфігурація
            </a>
          </li>
        </ul>
      </div>

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

          {selectedUserId && (
            <div className="modal is-active">
              <div className="modal-background"></div>
              <div className="modal-card">
                <header className="modal-card-head">
                  <p className="modal-card-title has-text-weight-medium">
                    Змінити пароль користувача ID: {selectedUserId}
                  </p>
                </header>
                <div className="modal-card-body">
                  <div className="field">
                    <input
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
            onUserSelect={setSelectedUserId}
            onEditUser={(u) => setEditUser(u)}
            onCreateUser={() => setNewUserModalOpen(true)}
            key={usersReloadKey}
          />
        </>
      )}

      {activeTab === "settings" && (
        <div style={{ padding: 16 }}>
          <RegionNotifications />
        </div>
      )}

      {activeTab === "scheduler" && (
        <SchedulerConfig title="Ручний запуск планувальника" />
      )}

      {activeTab === "configuration" && (
        <div className="configuration-compact">
          <BranchConfig />
          <CitiesConfig />
          <BalancePagesConfig />
          <ReportsConfig />
          <ImportSourcesConfig />
          <SchedulerConfig title="Планувальник" />
        </div>
      )}

      <ScrollToTopButton />
    </div>
  );
}
