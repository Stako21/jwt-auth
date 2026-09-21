import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext.jsx";
import CompactSelect from "../components/CompactSelect/CompactSelect.jsx";
import { fetchWarehouseDashboard } from "../services/warehouseDashboard.api.js";
import style from "./WarehouseDashboard.module.scss";

const STORAGE_KEY = "warehouse-dashboard-selected-warehouse";
const REFRESH_INTERVAL_MS = 60_000;
const STALE_AFTER_MS = 10 * 60_000;

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(year, month - 1, day).toLocaleDateString("uk-UA");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("uk-UA");
}

export default function WarehouseDashboard() {
  const { handleLogOut } = useContext(AuthContext);
  const [dashboard, setDashboard] = useState(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(() =>
    window.localStorage.getItem(STORAGE_KEY) || "",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const data = await fetchWarehouseDashboard(selectedWarehouseId || undefined);
      setDashboard(data);
      setError("");
      const resolvedId = String(data.warehouse?.id || "");
      if (resolvedId && resolvedId !== selectedWarehouseId) {
        setSelectedWarehouseId(resolvedId);
        window.localStorage.setItem(STORAGE_KEY, resolvedId);
      }
    } catch (loadError) {
      if (loadError?.response?.status === 403 && selectedWarehouseId) {
        window.localStorage.removeItem(STORAGE_KEY);
        setSelectedWarehouseId("");
        return;
      }
      setError(loadError?.response?.data?.error || "Не вдалося оновити рейтинг");
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    load();
    const refreshTimer = window.setInterval(load, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, [load]);

  useEffect(() => {
    const clockTimer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(clockTimer);
  }, []);

  const warehouseOptions = useMemo(
    () => (dashboard?.warehouses || []).map((warehouse) => ({
      value: String(warehouse.id),
      label: warehouse.warehouseName,
    })),
    [dashboard?.warehouses],
  );

  const stale = dashboard?.dataUpdatedAt
    ? clock.getTime() - new Date(dashboard.dataUpdatedAt).getTime() > STALE_AFTER_MS
    : false;

  const changeWarehouse = (value) => {
    const normalized = String(value);
    window.localStorage.setItem(STORAGE_KEY, normalized);
    setSelectedWarehouseId(normalized);
    setLoading(true);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (fullscreenError) {
      console.error(fullscreenError);
    }
  };

  return (
    <section className={style.dashboard}>
      <header className={style.header}>
        <div>
          <p className={style.eyebrow}>СКЛАДСЬКА ЗМІНА</p>
          <p className={style.shift}>
            {formatDate(dashboard?.shift?.startDate)} {dashboard?.shift?.startTime || "08:00"}
            <span>—</span>
            {formatDate(dashboard?.shift?.endDate)} {dashboard?.shift?.endTime || "08:00"}
          </p>
        </div>
        <div className={style.headerActions}>
          <div className={style.clock}>
            <strong>{clock.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</strong>
            <span>{clock.toLocaleDateString("uk-UA")}</span>
          </div>
          <button type="button" className={style.iconButton} onClick={toggleFullscreen} aria-label="Повноекранний режим">
            <i className="fa-solid fa-expand" aria-hidden="true" />
          </button>
          <button type="button" className={style.iconButton} onClick={handleLogOut} aria-label="Вийти">
            <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className={style.controlRow}>
        <div className={style.warehouseChoice}>
          <span>Склад</span>
          {warehouseOptions.length > 1 ? (
            <CompactSelect
              value={selectedWarehouseId}
              options={warehouseOptions}
              onChange={changeWarehouse}
              ariaLabel="Вибір складу"
            />
          ) : (
            <strong>{dashboard?.warehouse?.warehouseName || "—"}</strong>
          )}
        </div>
        <div className={`${style.freshness} ${stale ? style.stale : ""}`}>
          <i className={`fa-solid ${stale ? "fa-triangle-exclamation" : "fa-arrows-rotate"}`} aria-hidden="true" />
          <span>
            {stale ? "Дані давно не оновлювалися" : "Оновлено"}
            <small>{formatDateTime(dashboard?.dataUpdatedAt)}</small>
          </span>
        </div>
      </div>

      <div className={style.summary}>
        <article><span>Накладні</span><strong>{formatNumber(dashboard?.summary?.documentsCount)}</strong></article>
        <article><span>Працівники</span><strong>{formatNumber(dashboard?.summary?.workersCount)}</strong></article>
        <article><span>Рядки</span><strong>{formatNumber(dashboard?.summary?.rowsCount)}</strong></article>
        <article><span>Вага, кг</span><strong>{formatNumber(dashboard?.summary?.weight, 1)}</strong></article>
      </div>

      <div className={style.tableShell} aria-busy={loading}>
        {error ? <div className={style.message}>{error}</div> : null}
        {!error && !loading && !dashboard?.ranking?.length ? (
          <div className={style.message}>У поточній зміні ще немає зібраних накладних</div>
        ) : null}
        {dashboard?.ranking?.length ? (
          <table className={style.rankingTable}>
            <thead>
              <tr>
                <th>Місце</th>
                <th>Працівник</th>
                <th>Накладні</th>
                <th>Рядки</th>
                <th>Вага, кг</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.ranking.map((row) => (
                <tr key={row.pickerGuid} data-rank={row.rank}>
                  <td><span className={style.rank}>{row.rank}</span></td>
                  <td>{row.picker}</td>
                  <td className={style.primaryMetric}>{formatNumber(row.documentsCount)}</td>
                  <td>{formatNumber(row.rowsCount)}</td>
                  <td>{formatNumber(row.weight, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {loading ? <div className={style.loading}>Оновлення…</div> : null}
      </div>
    </section>
  );
}
