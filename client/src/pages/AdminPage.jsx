import React, { useContext, useState } from "react";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import style from "./style.module.scss";
import { useSnackbar } from "notistack";
import { UsersList } from "../components/UsersList/UsersList";
import { Sidebar } from "../components/Sidebar/Sidebar";
import { RegionNotifications } from "../components/RegionNotifications/RegionNotifications";
import config from "../config";
import ScrollToTopButton from "../components/ScrollToTopButton/ScrollToTopButton";
import { ROLE_LABELS } from "../utils/roles";

export default function AdminPage() {
  const { userInfo, handleLogOut } = useContext(AuthContext);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [activeTab, setActiveTab] = useState("users");

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== "users") {
      setSelectedUserId(null);
      setEditUser(null);
      setNewUserModalOpen(false);
    }
  };

  const { enqueueSnackbar } = useSnackbar();

  const handlePasswordChange = async () => {
    if (!selectedUserId || !newPassword) {
      enqueueSnackbar("Поле нового пароля пусте", { variant: "error" });
      return;
    }

    try {
      await axios.put(
        `${config.API_URL}/auth/users/${selectedUserId}/password`,
        { newPassword },
      );
      enqueueSnackbar("Пароль успішно змінено!", { variant: "success" });

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
            <a onClick={() => handleTabChange("users")}>Users</a>
          </li>
          <li className={activeTab === "settings" ? "is-active" : ""}>
            <a onClick={() => handleTabChange("settings")}>
              Settings Notification
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
                    Change Password for User ID: {selectedUserId}
                  </p>
                </header>
                <div className="modal-card-body">
                  <div className="field">
                    <input
                      className="input"
                      type="text"
                      placeholder="Enter new password"
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
                        Change Password
                      </button>
                      <button
                        className="button is-danger is-dark is-fullwidth"
                        // style={{ marginLeft: 8 }}
                        onClick={() => onCancel && onCancel()}
                      >
                        Cancel
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

      <ScrollToTopButton />
    </div>
  );
}
