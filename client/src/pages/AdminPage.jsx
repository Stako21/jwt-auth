import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import { AuthClient, AuthContext } from "../context/AuthContext";
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
  const [schedulerTasks, setSchedulerTasks] = useState([]);
  const [isSchedulerLoading, setIsSchedulerLoading] = useState(false);
  const [runningTaskKey, setRunningTaskKey] = useState("");
  const [savingTaskKey, setSavingTaskKey] = useState("");
  const [intervalDraftByTask, setIntervalDraftByTask] = useState({});

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== "users") {
      setSelectedUserId(null);
      setEditUser(null);
      setNewUserModalOpen(false);
    }
  };

  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (activeTab !== "scheduler" || schedulerTasks.length > 0 || isSchedulerLoading) {
      return;
    }

    const loadSchedulerTasks = async () => {
      setIsSchedulerLoading(true);
      try {
        const response = await AuthClient.get("/scheduler/tasks");
        const tasks = response.data?.tasks || [];
        setSchedulerTasks(tasks);
        setIntervalDraftByTask(
          tasks.reduce((acc, task) => {
            acc[task.key] = String(Math.max(1, Math.round(task.intervalMs / 1000)));
            return acc;
          }, {}),
        );
      } catch (error) {
        enqueueSnackbar("Failed to load scheduler tasks", { variant: "error" });
        console.error("Error loading scheduler tasks:", error);
      } finally {
        setIsSchedulerLoading(false);
      }
    };

    loadSchedulerTasks();
  }, [activeTab, schedulerTasks.length, isSchedulerLoading, enqueueSnackbar]);

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

  const handleRunSchedulerTask = async (taskKey) => {
    if (!taskKey) return;

    setRunningTaskKey(taskKey);
    try {
      await AuthClient.post(`/scheduler/run/${taskKey}`);
      enqueueSnackbar(`Task ${taskKey} started`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(`Failed to run ${taskKey}`, { variant: "error" });
      console.error(`Error running scheduler task ${taskKey}:`, error);
    } finally {
      setRunningTaskKey("");
    }
  };

  const handleToggleSchedulerTask = async (taskKey, nextActive) => {
    setSavingTaskKey(taskKey);
    try {
      const response = await AuthClient.patch(`/scheduler/tasks/${taskKey}`, {
        active: nextActive,
      });
      const updatedTask = response.data?.task;
      if (updatedTask) {
        setSchedulerTasks((prev) =>
          prev.map((task) => (task.key === taskKey ? updatedTask : task)),
        );
      }
      enqueueSnackbar(`Task ${taskKey} updated`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(`Failed to update ${taskKey}`, { variant: "error" });
      console.error(`Error updating scheduler task ${taskKey}:`, error);
    } finally {
      setSavingTaskKey("");
    }
  };

  const handleSaveSchedulerInterval = async (taskKey) => {
    const rawValue = intervalDraftByTask[taskKey];
    const intervalSeconds = Number(rawValue);

    if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
      enqueueSnackbar("Interval must be a positive integer (seconds)", {
        variant: "error",
      });
      return;
    }

    setSavingTaskKey(taskKey);
    try {
      const response = await AuthClient.patch(`/scheduler/tasks/${taskKey}`, {
        intervalMs: intervalSeconds * 1000,
      });
      const updatedTask = response.data?.task;
      if (updatedTask) {
        setSchedulerTasks((prev) =>
          prev.map((task) => (task.key === taskKey ? updatedTask : task)),
        );
        setIntervalDraftByTask((prev) => ({
          ...prev,
          [taskKey]: String(Math.max(1, Math.round(updatedTask.intervalMs / 1000))),
        }));
      }
      enqueueSnackbar(`Interval for ${taskKey} updated`, { variant: "success" });
    } catch (error) {
      enqueueSnackbar(`Failed to update interval for ${taskKey}`, { variant: "error" });
      console.error(`Error updating interval for scheduler task ${taskKey}:`, error);
    } finally {
      setSavingTaskKey("");
    }
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
          <li className={activeTab === "scheduler" ? "is-active" : ""}>
            <a onClick={() => handleTabChange("scheduler")}>Scheduler</a>
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

      {activeTab === "scheduler" && (
        <div style={{ padding: 16 }}>
          <h3 className="title is-5">Manual Scheduler Run</h3>
          {isSchedulerLoading && <p>Loading tasks...</p>}
          {!isSchedulerLoading && schedulerTasks.length === 0 && (
            <p>No scheduler tasks available.</p>
          )}
          {!isSchedulerLoading && schedulerTasks.length > 0 && (
            <table className="table is-fullwidth is-striped is-hoverable">
              <thead>
                <tr>
                  <th>Active</th>
                  <th>Task</th>
                  <th>Interval (sec)</th>
                  <th>Save interval</th>
                  <th>Run now</th>
                </tr>
              </thead>
              <tbody>
                {schedulerTasks.map((task) => (
                  <tr key={task.key}>
                    <td>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(task.active)}
                          disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                          onChange={(e) =>
                            handleToggleSchedulerTask(task.key, e.target.checked)
                          }
                        />
                      </label>
                    </td>
                    <td>{task.label}</td>
                    <td style={{ maxWidth: 180 }}>
                      <input
                        type="number"
                        min="1"
                        className="input"
                        value={intervalDraftByTask[task.key] ?? ""}
                        disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                        onChange={(e) =>
                          setIntervalDraftByTask((prev) => ({
                            ...prev,
                            [task.key]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`button is-link ${
                          savingTaskKey === task.key ? "is-loading" : ""
                        }`}
                        disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                        onClick={() => handleSaveSchedulerInterval(task.key)}
                      >
                        Save
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`button is-primary ${
                          runningTaskKey === task.key ? "is-loading" : ""
                        }`}
                        disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                        onClick={() => handleRunSchedulerTask(task.key)}
                      >
                        Run
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ScrollToTopButton />
    </div>
  );
}
