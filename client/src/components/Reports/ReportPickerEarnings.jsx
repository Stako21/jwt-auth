import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchStaticReport } from "../../services/reports.api";
import style from "./ReportPickerEarnings.module.scss";
import { DataLoader } from "../DataLoader/DataLoader";

const REPORT_KEY = "report-picker-earnings";

function dateKey(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { dateFrom: dateKey(from), dateTo: dateKey(to) };
}

function formatReportBoundary(value, addDays = 0) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + addDays);
  return `${date.toLocaleDateString("uk-UA")} 08:00`;
}

function number(value, digits = 0) {
  return Number(value || 0).toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function ReportPickerEarnings({ setLastUpdateTime }) {
  const [range, setRange] = useState(initialRange);
  const [appliedRange, setAppliedRange] = useState(initialRange);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchStaticReport(REPORT_KEY, appliedRange)
      .then((result) => {
        if (!active) return;
        setRows(Array.isArray(result?.rows) ? result.rows : []);
        if (typeof setLastUpdateTime === "function") setLastUpdateTime("");
      })
      .catch((loadError) => {
        if (!active) return;
        setRows([]);
        setError(
          loadError.response?.data?.error ||
            loadError.response?.data?.message ||
            "Не вдалося завантажити аналітику",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedRange, setLastUpdateTime]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      [row.picker, row.warehouseName]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query, rows]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of filteredRows) {
      const key = row.pickerGuid || row.picker;
      if (!map.has(key)) {
        map.set(key, {
          key,
          picker: row.picker,
          pickerGuid: row.pickerGuid,
          documentsCount: 0,
          rowsCount: 0,
          weight: 0,
          rowEarnings: 0,
          kilogramEarnings: 0,
          missingRateRows: 0,
          missingUser: false,
          warehouses: [],
        });
      }
      const group = map.get(key);
      group.documentsCount += Number(row.documentsCount || 0);
      group.rowsCount += Number(row.rowsCount || 0);
      group.weight += Number(row.weight || 0);
      group.rowEarnings += Number(row.rowEarnings || 0);
      group.kilogramEarnings += Number(row.kilogramEarnings || 0);
      group.missingRateRows += Number(row.missingRateRows || 0);
      group.missingUser ||= Boolean(Number(row.missingUser));
      group.warehouses.push(row);
    }
    return [...map.values()].sort((left, right) =>
      left.picker.localeCompare(right.picker, "uk-UA"),
    );
  }, [filteredRows]);

  const apply = (event) => {
    event.preventDefault();
    if (range.dateFrom > range.dateTo) {
      setError("Початкова дата не може бути пізніше кінцевої");
      return;
    }
    setAppliedRange({ ...range });
  };

  return (
    <section className={style.report}>
      <div className={style.header}>
        <div>
          <h2>Заробіток комплектувальників</h2>
          <p>Суми за рядки та кілограми відображаються окремо.</p>
        </div>
        <form className={style.filters} onSubmit={apply}>
          <label>
            <span className={style.dateLabel}>
              З <small>{formatReportBoundary(range.dateFrom)}</small>
            </span>
            <input type="date" value={range.dateFrom} onChange={(e) => setRange((current) => ({ ...current, dateFrom: e.target.value }))} />
          </label>
          <label>
            <span className={style.dateLabel}>
              По <small>{formatReportBoundary(range.dateTo, 1)}</small>
            </span>
            <input type="date" value={range.dateTo} onChange={(e) => setRange((current) => ({ ...current, dateTo: e.target.value }))} />
          </label>
          <label className={style.searchField}>
            Пошук
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Комплектувальник або склад"
            />
          </label>
          <button className="button is-primary is-small" type="submit">Показати</button>
        </form>
      </div>

      {loading ? <DataLoader label="Розраховуємо заробіток комплектувальників…" /> : null}
      {error ? <div className="notification is-danger is-light">{error}</div> : null}
      {!loading && !error && groups.length === 0 ? (
        <div className="notification is-info is-light">За вибраний період даних немає.</div>
      ) : null}

      {!loading && groups.length ? (
        <div className={style.tableShell}>
          <table className={style.table}>
            <thead>
              <tr><th>Комплектувальник / склад</th><th>Накладні (шт.)</th><th>Рядки (шт.)</th><th>Вага (кг.)</th><th>За рядки (грн)</th><th>За кг (грн)</th><th>Заробіток разом (грн)</th></tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.key}>
                  <tr className={style.pickerRow}>
                    <td>
                      {group.picker}
                      {group.missingUser ? <span className={style.warning}>Користувача з цим GUID не знайдено</span> : null}
                      {group.missingRateRows ? <span className={style.warning}>Без ставки: {group.missingRateRows} рядків звіту</span> : null}
                    </td>
                    <td>{number(group.documentsCount)}</td><td>{number(group.rowsCount)}</td><td>{number(group.weight, 3)}</td><td>{number(group.rowEarnings, 2)}</td><td>{number(group.kilogramEarnings, 2)}</td><td>{number(group.rowEarnings + group.kilogramEarnings, 2)}</td>
                  </tr>
                  {/* {group.warehouses.map((row) => (
                    <tr key={`${group.key}:${row.warehouseGuid || row.warehouseName}`}>
                      <td className={style.warehouse}>{row.warehouseName}</td>
                      <td>{number(row.documentsCount)}</td><td>{number(row.rowsCount)}</td><td>{number(row.weight, 3)}</td><td>{number(row.rowEarnings, 2)}</td><td>{number(row.kilogramEarnings, 2)}</td><td>{number(Number(row.rowEarnings || 0) + Number(row.kilogramEarnings || 0), 2)}</td>
                    </tr>
                  ))} */}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
