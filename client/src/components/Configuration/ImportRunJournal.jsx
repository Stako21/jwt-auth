import { useCallback, useEffect, useMemo, useState } from "react";
import FormSelect from "../FormControl/FormSelect.jsx";
import { DataLoader } from "../DataLoader/DataLoader.jsx";
import { fetchImportRuns } from "../../services/scheduler.api.js";
import styles from "./ImportRunJournal.module.scss";

const REFRESH_INTERVAL_MS = 30 * 1000;

const STATUS_LABELS = {
  completed: "Виконано",
  completed_with_warnings: "Із попередженнями",
  skipped: "Пропущено",
  failed: "Помилка",
};

const TASK_LABELS = {
  loadSalesAgents: "Торгові агенти",
  loadSalesReports: "Звіти продажів",
  loadOrdersByTimeReport: "Заявки за часом",
  loadBillOfLadingReport: "Зібрані накладні",
  loadScheduledXlsx1cSalesReports: "XLSX-звіти 1С",
  loadProducts: "Товари",
  loadTroProducts: "Довідник ТРО",
  loadTradePoints: "Торгові точки",
};

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("uk-UA");
}

function formatDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return "—";
  if (duration < 1000) return `${duration} мс`;
  return `${(duration / 1000).toFixed(duration < 10_000 ? 1 : 0)} с`;
}

function taskLabel(run) {
  return TASK_LABELS[run.task] || run.label || run.task;
}

function branchLabel(run) {
  return (
    run.branch?.short_name || run.branch?.name || run.branch?.slug || "Глобальна"
  );
}

function statusClass(status) {
  if (status === "failed") return styles.failed;
  if (status === "completed_with_warnings") return styles.warning;
  if (status === "skipped") return styles.skipped;
  return styles.completed;
}

export function ImportRunJournal() {
  const [runs, setRuns] = useState([]);
  const [meta, setMeta] = useState({});
  const [taskFilter, setTaskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadRuns = useCallback(async ({ background = false } = {}) => {
    background ? setRefreshing(true) : setLoading(true);
    try {
      const response = await fetchImportRuns({ limit: 500 });
      setRuns(response.data);
      setMeta(response.meta);
      setError("");
    } catch (requestError) {
      console.error("Failed to load import run journal:", requestError);
      setError("Не вдалося завантажити журнал імпортів");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
    const intervalId = window.setInterval(() => {
      if (!document.hidden) void loadRuns({ background: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadRuns]);

  const taskOptions = useMemo(
    () =>
      [...new Set(runs.map((run) => run.task))]
        .filter(Boolean)
        .sort((left, right) =>
          (TASK_LABELS[left] || left).localeCompare(TASK_LABELS[right] || right, "uk"),
        ),
    [runs],
  );

  const visibleRuns = useMemo(
    () =>
      runs.filter(
        (run) =>
          (!taskFilter || run.task === taskFilter) &&
          (!statusFilter || run.status === statusFilter),
      ),
    [runs, statusFilter, taskFilter],
  );

  return (
    <section className={styles.journal}>
      <header className={styles.header}>
        <div>
          <h2>Журнал завантажень</h2>
          <p>
            Поточний журнал API за останні {meta.retention_days || 7} днів.
            Після перезапуску сервера записи очищаються.
          </p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          disabled={loading || refreshing}
          onClick={() => void loadRuns({ background: true })}
        >
          <i
            className={`fa-solid fa-rotate ${refreshing ? styles.spinning : ""}`}
            aria-hidden="true"
          />
          Оновити
        </button>
      </header>

      <div className={styles.filters}>
        <label>
          <span>Завантаження</span>
          <FormSelect
            compact
            value={taskFilter}
            onChange={(event) => setTaskFilter(event.target.value)}
          >
            <option value="">Усі задачі</option>
            {taskOptions.map((task) => (
              <option value={task} key={task}>
                {TASK_LABELS[task] || task}
              </option>
            ))}
          </FormSelect>
        </label>
        <label>
          <span>Статус</span>
          <FormSelect
            compact
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Усі статуси</option>
            {Object.entries(STATUS_LABELS).map(([status, label]) => (
              <option value={status} key={status}>
                {label}
              </option>
            ))}
          </FormSelect>
        </label>
        <div className={styles.counter}>
          Показано: {visibleRuns.length}
          {Number(meta.available) > runs.length ? ` із ${meta.available}` : ""}
        </div>
      </div>

      {loading ? (
        <DataLoader label="Завантаження журналу…" compact />
      ) : error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : visibleRuns.length === 0 ? (
        <p className={styles.empty}>Записів за вибраними умовами ще немає.</p>
      ) : (
        <div className={styles.results}>
          <table>
            <thead>
              <tr>
                <th>Час</th>
                <th>Завантаження</th>
                <th>Статус</th>
                <th>Запуск</th>
                <th>Філія</th>
                <th>Тривалість</th>
                <th>Результат</th>
              </tr>
            </thead>
            <tbody>
              {visibleRuns.map((run) => (
                <tr key={run.id}>
                  <td data-label="Час">{formatTimestamp(run.finished_at)}</td>
                  <td data-label="Завантаження">{taskLabel(run)}</td>
                  <td data-label="Статус">
                    <span className={`${styles.status} ${statusClass(run.status)}`}>
                      {STATUS_LABELS[run.status] || run.status}
                    </span>
                  </td>
                  <td data-label="Запуск">
                    {run.trigger === "manual" ? "Вручну" : "За розкладом"}
                  </td>
                  <td data-label="Філія">{branchLabel(run)}</td>
                  <td data-label="Тривалість">{formatDuration(run.duration_ms)}</td>
                  <td data-label="Результат" className={styles.resultCell}>
                    <div>{run.message || run.code || "—"}</div>
                    {run.code ? <small>{run.code}</small> : null}
                    {run.details && Object.keys(run.details).length > 0 ? (
                      <details>
                        <summary>Деталі</summary>
                        <pre>{JSON.stringify(run.details, null, 2)}</pre>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
