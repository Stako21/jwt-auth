import { useCallback, useEffect, useRef, useState } from "react";
import { useSnackbar } from "notistack";
import {
  fetchSchedulerTasks,
  runSchedulerTaskNow,
  updateSchedulerTaskConfig,
} from "../../services/scheduler.api";

const BASE_POLL_INTERVAL_MS = 30 * 1000;
const FAST_POLL_INTERVAL_MS = 3 * 1000;
const FAST_POLL_WINDOW_MS = 30 * 1000;

function getRunStatusTagClass(status) {
  if (status === "failed") return "is-danger is-light";
  if (status === "completed_with_warnings") return "is-warning is-light";
  if (status === "skipped") return "is-light";
  return "is-success is-light";
}

function getRunStatusLabel(status) {
  if (status === "completed_with_warnings") return "Із попередженнями";
  if (status === "skipped") return "Пропущено";
  if (status === "failed") return "Помилка";
  return "Виконано";
}

function getRunSnackbarVariant(status) {
  if (status === "failed") return "error";
  if (status === "completed_with_warnings" || status === "skipped") {
    return "warning";
  }
  return "success";
}

function formatRunTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("uk-UA");
}

export function SchedulerConfig({ title = "Планувальник" }) {
  const { enqueueSnackbar } = useSnackbar();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [runningTaskKey, setRunningTaskKey] = useState("");
  const [savingTaskKey, setSavingTaskKey] = useState("");
  const [intervalDraftByTask, setIntervalDraftByTask] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pollNonce, setPollNonce] = useState(0);
  const [fastPollingUntil, setFastPollingUntil] = useState(0);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );
  const dirtyIntervalTaskKeysRef = useRef(new Set());
  const loadTasksPromiseRef = useRef(null);
  const previousDocumentVisibleRef = useRef(
    typeof document === "undefined" ? true : !document.hidden,
  );

  const loadTasks = useCallback(
    async ({ background = false, notifyOnError = true } = {}) => {
      if (loadTasksPromiseRef.current) {
        return loadTasksPromiseRef.current;
      }

      const loadPromise = (async () => {
        if (background) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          const nextTasks = await fetchSchedulerTasks();
          setTasks(nextTasks);
          setIntervalDraftByTask((prev) =>
            nextTasks.reduce((acc, task) => {
              const nextValue = String(
                Math.max(1, Math.round(task.intervalMs / 1000)),
              );
              acc[task.key] = dirtyIntervalTaskKeysRef.current.has(task.key)
                ? prev[task.key] ?? nextValue
                : nextValue;
              return acc;
            }, {}),
          );
          setLastUpdatedAt(new Date().toISOString());
        } catch (error) {
          console.error("Failed to load scheduler tasks:", error);
          if (notifyOnError) {
            enqueueSnackbar("Не вдалося завантажити задачі планувальника", {
              variant: "error",
            });
          }
        } finally {
          setHasLoadedOnce(true);
          setPollNonce((value) => value + 1);
          setLoading(false);
          setRefreshing(false);
          loadTasksPromiseRef.current = null;
        }
      })();

      loadTasksPromiseRef.current = loadPromise;
      return loadPromise;
    },
    [enqueueSnackbar],
  );

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleVisibilityChange = () => {
      setIsDocumentVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const wasVisible = previousDocumentVisibleRef.current;
    previousDocumentVisibleRef.current = isDocumentVisible;

    if (!hasLoadedOnce || !isDocumentVisible || wasVisible) {
      return;
    }

    void loadTasks({ background: true });
  }, [hasLoadedOnce, isDocumentVisible, loadTasks]);

  useEffect(() => {
    if (!hasLoadedOnce || !isDocumentVisible) {
      return undefined;
    }

    const pollIntervalMs =
      fastPollingUntil > Date.now()
        ? FAST_POLL_INTERVAL_MS
        : BASE_POLL_INTERVAL_MS;

    const timeoutId = window.setTimeout(() => {
      void loadTasks({ background: true, notifyOnError: false });
    }, pollIntervalMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fastPollingUntil, hasLoadedOnce, isDocumentVisible, loadTasks, pollNonce]);

  const handleRunTask = async (taskKey) => {
    if (!taskKey) return;

    setRunningTaskKey(taskKey);
    try {
      const response = await runSchedulerTaskNow(taskKey);
      const nextTask = response?.task || null;
      if (nextTask) {
        setTasks((prev) =>
          prev.map((task) => (task.key === taskKey ? nextTask : task)),
        );
      }

      const task = nextTask || tasks.find((item) => item.key === taskKey);
      const runResult = response?.runResult || null;
      const branchLabel =
        task?.systemBranch?.shortName ||
        task?.systemBranch?.name ||
        task?.systemBranch?.slug ||
        "";

      const baseMessage =
        runResult?.message ||
        (branchLabel
          ? `Задачу ${taskKey} запущено для філії ${branchLabel}`
          : `Задачу ${taskKey} запущено`);

      enqueueSnackbar(
        branchLabel && runResult?.status === "completed"
          ? `${baseMessage} (${branchLabel})`
          : baseMessage,
        { variant: getRunSnackbarVariant(runResult?.status) },
      );
    } catch (error) {
      console.error(`Error running scheduler task ${taskKey}:`, error);
      const failedTask = error.response?.data?.task;
      if (failedTask) {
        setTasks((prev) =>
          prev.map((task) => (task.key === taskKey ? failedTask : task)),
        );
      }

      enqueueSnackbar(
        error.response?.data?.runResult?.message ||
          error.response?.data?.blockedReason ||
          error.response?.data?.error ||
          `Не вдалося запустити задачу ${taskKey}`,
        { variant: "error" },
      );
    } finally {
      setFastPollingUntil(Date.now() + FAST_POLL_WINDOW_MS);
      setRunningTaskKey("");
    }
  };

  const handleToggleTask = async (taskKey, nextActive) => {
    setSavingTaskKey(taskKey);
    try {
      const updatedTask = await updateSchedulerTaskConfig(taskKey, {
        active: nextActive,
      });
      if (updatedTask) {
        setTasks((prev) =>
          prev.map((task) => (task.key === taskKey ? updatedTask : task)),
        );
      }
      enqueueSnackbar(`Задачу ${taskKey} оновлено`, { variant: "success" });
    } catch (error) {
      console.error(`Error updating scheduler task ${taskKey}:`, error);
      enqueueSnackbar(`Не вдалося оновити задачу ${taskKey}`, {
        variant: "error",
      });
    } finally {
      setSavingTaskKey("");
    }
  };

  const handleSaveInterval = async (taskKey) => {
    const rawValue = intervalDraftByTask[taskKey];
    const intervalSeconds = Number(rawValue);

    if (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0) {
      enqueueSnackbar("Інтервал має бути додатним цілим числом у секундах", {
        variant: "error",
      });
      return;
    }

    setSavingTaskKey(taskKey);
    try {
      const updatedTask = await updateSchedulerTaskConfig(taskKey, {
        intervalMs: intervalSeconds * 1000,
      });
      if (updatedTask) {
        dirtyIntervalTaskKeysRef.current.delete(taskKey);
        setTasks((prev) =>
          prev.map((task) => (task.key === taskKey ? updatedTask : task)),
        );
        setIntervalDraftByTask((prev) => ({
          ...prev,
          [taskKey]: String(Math.max(1, Math.round(updatedTask.intervalMs / 1000))),
        }));
      }
      enqueueSnackbar(`Інтервал для ${taskKey} оновлено`, {
        variant: "success",
      });
    } catch (error) {
      console.error(`Error updating interval for scheduler task ${taskKey}:`, error);
      enqueueSnackbar(`Не вдалося оновити інтервал для ${taskKey}`, {
        variant: "error",
      });
    } finally {
      setSavingTaskKey("");
    }
  };

  const handleIntervalDraftChange = (taskKey, value) => {
    dirtyIntervalTaskKeysRef.current.add(taskKey);
    setIntervalDraftByTask((prev) => ({
      ...prev,
      [taskKey]: value,
    }));
  };

  const autoRefreshLabel = !isDocumentVisible
    ? "Автооновлення призупинено, поки вкладка браузера прихована"
    : fastPollingUntil > Date.now()
      ? `Швидке автооновлення активне (${Math.round(
          FAST_POLL_INTERVAL_MS / 1000,
        )} с)`
      : `Автооновлення кожні ${Math.round(BASE_POLL_INTERVAL_MS / 1000)} с`;

  return (
    <div style={{ padding: 16 }}>
      <div className="is-flex is-justify-content-space-between is-align-items-center mb-3">
        <div>
          <h3 className="title is-5 mb-1">{title}</h3>
          <p className="help mb-0">
            {autoRefreshLabel}
            {lastUpdatedAt ? ` | Оновлено ${formatRunTimestamp(lastUpdatedAt)}` : ""}
          </p>
        </div>
        <button
          type="button"
          className={`button is-light ${refreshing ? "is-loading" : ""}`}
          disabled={
            loading ||
            refreshing ||
            Boolean(runningTaskKey) ||
            Boolean(savingTaskKey)
          }
          onClick={() => {
            void loadTasks({ background: true });
          }}
        >
          Оновити
        </button>
      </div>
      {loading && <p>Завантаження задач...</p>}
      {!loading && tasks.length === 0 && (
        <p>Немає доступних задач планувальника.</p>
      )}
      {!loading && tasks.length > 0 && (
        <table className="table is-fullwidth is-striped is-hoverable">
          <thead>
            <tr>
              <th>Активна</th>
              <th>Задача</th>
              <th>Інтервал (с)</th>
              <th>Статус</th>
              <th>Філія виконання</th>
              <th>Зберегти інтервал</th>
              <th>Запустити</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.key}>
                <td>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(task.active)}
                      disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                      onChange={(e) => handleToggleTask(task.key, e.target.checked)}
                    />
                  </label>
                </td>
                <td>
                  <div>{task.label}</div>
                  {task.requiresSystemBranch && (
                    <p className="help mb-0">
                      Потребує налаштованої системної філії
                    </p>
                  )}
                </td>
                <td style={{ maxWidth: 180 }}>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={intervalDraftByTask[task.key] ?? ""}
                    disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                    onChange={(e) =>
                      handleIntervalDraftChange(task.key, e.target.value)
                    }
                  />
                </td>
                <td style={{ minWidth: 220 }}>
                  {task.blockedReason ? (
                    <>
                      <span className="tag is-warning is-light">Заблоковано</span>
                      <p className="help mb-0">{task.blockedReason}</p>
                    </>
                  ) : task.lastRun ? (
                    <>
                      <span className={`tag ${getRunStatusTagClass(task.lastRun.status)}`}>
                        {getRunStatusLabel(task.lastRun.status)}
                      </span>
                      {task.lastRun.message ? (
                        <p className="help mb-0">{task.lastRun.message}</p>
                      ) : null}
                      <p className="help mb-0">
                        {task.lastRun.trigger === "scheduled"
                          ? "За розкладом"
                          : "Вручну"}
                        {task.lastRun.finishedAt
                          ? ` о ${formatRunTimestamp(task.lastRun.finishedAt)}`
                          : ""}
                      </p>
                    </>
                  ) : (
                    <span className="tag is-success is-light">Готово</span>
                  )}
                </td>
                <td style={{ minWidth: 220 }}>
                  {task.requiresSystemBranch ? (
                    task.systemBranch ? (
                      <span className="tag is-info is-light">
                        {task.systemBranch.shortName ||
                          task.systemBranch.name ||
                          task.systemBranch.slug}
                      </span>
                    ) : (
                      <span className="tag is-light">Не визначено</span>
                    )
                  ) : (
                    <span className="has-text-grey">Глобальна</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className={`button is-link ${
                      savingTaskKey === task.key ? "is-loading" : ""
                    }`}
                    disabled={Boolean(savingTaskKey) || Boolean(runningTaskKey)}
                    onClick={() => handleSaveInterval(task.key)}
                  >
                    Зберегти
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className={`button is-primary ${
                      runningTaskKey === task.key ? "is-loading" : ""
                    }`}
                    disabled={
                      Boolean(savingTaskKey) ||
                      Boolean(runningTaskKey) ||
                      Boolean(task.blockedReason)
                    }
                    onClick={() => handleRunTask(task.key)}
                  >
                    Запустити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
