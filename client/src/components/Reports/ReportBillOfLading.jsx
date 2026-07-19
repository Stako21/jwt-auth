import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { fetchStaticReport } from "../../services/reports.api";
import { AuthContext } from "../../context/AuthContext";
import { ROLE_IDS } from "../../utils/roles";
import { DataLoader } from "../DataLoader/DataLoader";
import style from "./ReportBillOfLading.module.scss";

const REPORT_KEY = "report-bill-of-lading";

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialRange() {
  const today = dateKey();
  return { dateFrom: today, dateTo: today };
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

function formatDateTime(value, { showSeconds = false } = {}) {
  const date = parseDate(value);
  if (!date) return "";

  return date.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
  });
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";

  return number.toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function getTotalEarnings(row) {
  if (row.rowEarnings === null || row.kilogramEarnings === null) return null;
  return Number(row.rowEarnings || 0) + Number(row.kilogramEarnings || 0);
}

function shortenPickerName(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 2) return parts.join(" ");

  return parts.slice(0, -1).join(" ");
}

function createGroup(label, displayLabel = label) {
  return {
    label,
    displayLabel,
    documentsCount: 0,
    rowsCount: 0,
    weight: 0,
    amount: 0,
    rowEarnings: 0,
    kilogramEarnings: 0,
    missingRateRows: 0,
    children: new Map(),
    rows: [],
  };
}

function addTotals(target, row) {
  target.documentsCount += Number(row.documentsCount || 0);
  target.rowsCount += Number(row.rowsCount || 0);
  target.weight += Number(row.weight || 0);
  target.amount += Number(row.amount || 0);
  target.rowEarnings += Number(row.rowEarnings || 0);
  target.kilogramEarnings += Number(row.kilogramEarnings || 0);
  target.missingRateRows += row.rowRate === null ? 1 : 0;
}

function finalizePicker(group) {
  return {
    ...group,
    rows: [...group.rows].sort((left, right) => {
      const leftDate = parseDate(left.scanDate)?.getTime() || 0;
      const rightDate = parseDate(right.scanDate)?.getTime() || 0;
      return leftDate - rightDate;
    }),
  };
}

function finalizeWarehouse(group) {
  return {
    ...group,
    children: Array.from(group.children.values())
      .map(finalizePicker)
      .sort((left, right) => left.label.localeCompare(right.label, "uk-UA")),
  };
}

function buildGroups(rows) {
  const warehouses = new Map();

  for (const row of rows) {
    const warehouseName = String(row.warehouseName || "").trim() || "Без складу";
    const picker = String(row.picker || "").trim() || "Без збирача";

    if (!warehouses.has(warehouseName)) {
      warehouses.set(warehouseName, createGroup(warehouseName));
    }

    const warehouse = warehouses.get(warehouseName);
    if (!warehouse.children.has(picker)) {
      warehouse.children.set(picker, createGroup(picker, shortenPickerName(picker)));
    }

    const pickerGroup = warehouse.children.get(picker);
    addTotals(warehouse, row);
    addTotals(pickerGroup, row);
    pickerGroup.rows.push(row);
  }

  return Array.from(warehouses.values())
    .map(finalizeWarehouse)
    .sort((left, right) => left.label.localeCompare(right.label, "uk-UA"));
}

function TotalsCells({ group }) {
  return (
    <>
      <td>{formatNumber(group.documentsCount)}</td>
      <td>{formatNumber(group.rowsCount)}</td>
      <td>{formatNumber(group.weight, 3)}</td>
      <td>{formatNumber(group.amount, 2)}</td>
      <td>{formatNumber(group.rowEarnings, 2)}</td>
      <td>{formatNumber(group.kilogramEarnings, 2)}</td>
      <td>{formatNumber(group.rowEarnings + group.kilogramEarnings, 2)}</td>
    </>
  );
}

export function ReportBillOfLading({ setLastUpdateTime }) {
  const { userInfo } = useContext(AuthContext);
  const isPicker = Number(userInfo?.role) === ROLE_IDS.Picker;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState(initialRange);
  const [appliedRange, setAppliedRange] = useState(initialRange);
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [query, setQuery] = useState("");
  const [collapsedWarehouses, setCollapsedWarehouses] = useState(() => new Set());
  const [collapsedPickers, setCollapsedPickers] = useState(() => new Set());

  useEffect(() => {
    let isActive = true;

    setLoading(true);
    setError("");

    fetchStaticReport(REPORT_KEY, appliedRange)
      .then((data) => {
        if (!isActive) return;
        setRows(Array.isArray(data) ? data : []);
        if (typeof setLastUpdateTime === "function") {
          setLastUpdateTime("");
        }
      })
      .catch((loadError) => {
        if (!isActive) return;
        console.error("Failed to load bill of lading report:", loadError);
        setRows([]);
        setError(
          loadError?.response?.data?.message ||
            loadError?.response?.data?.error ||
            "Не вдалося завантажити звіт",
        );
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [appliedRange, setLastUpdateTime]);

  const warehouseOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows.map((row) => String(row.warehouseName || "").trim()).filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "uk-UA"));
  }, [rows]);

  useEffect(() => {
    if (selectedWarehouse && !warehouseOptions.includes(selectedWarehouse)) {
      setSelectedWarehouse("");
    }
  }, [selectedWarehouse, warehouseOptions]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return rows.filter((row) => {
      if (
        selectedWarehouse &&
        String(row.warehouseName || "").trim() !== selectedWarehouse
      ) {
        return false;
      }

      if (!normalizedQuery) return true;

      return [
        row.warehouseName,
        row.picker,
        row.documentNumber,
        row.documentDate,
        row.scanDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, rows, selectedWarehouse]);

  const groups = useMemo(() => buildGroups(filteredRows), [filteredRows]);

  const toggleWarehouse = (warehouseLabel) => {
    setCollapsedWarehouses((current) => {
      const next = new Set(current);
      if (next.has(warehouseLabel)) {
        next.delete(warehouseLabel);
      } else {
        next.add(warehouseLabel);
      }
      return next;
    });
  };

  const togglePicker = (pickerKey) => {
    setCollapsedPickers((current) => {
      const next = new Set(current);
      if (next.has(pickerKey)) {
        next.delete(pickerKey);
      } else {
        next.add(pickerKey);
      }
      return next;
    });
  };

  const applyRange = (event) => {
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
          <h2 className={style.title}>Зібрані накладні</h2>
          <div className={style.summaryList}>
            {groups.map((warehouse) => (
              <p className={style.summaryRow} key={warehouse.label}>
                <strong>{warehouse.displayLabel}</strong>
                <span>Накладних: {formatNumber(warehouse.documentsCount)}</span>
                <span>Рядків: {formatNumber(warehouse.rowsCount)}</span>
                <span>Вага: {formatNumber(warehouse.weight, 3)}</span>
                <span>Сума: {formatNumber(warehouse.amount, 2)}</span>
                {isPicker ? (
                  <span className={style.pickerEarnings}>
                    Заробіток разом:{" "}
                    {formatNumber(
                      warehouse.rowEarnings + warehouse.kilogramEarnings,
                      2,
                    )}{" "}
                    грн
                  </span>
                ) : (
                  <>
                    <span>
                      За рядки: {formatNumber(warehouse.rowEarnings, 2)} грн
                    </span>
                    <span>
                      За кг: {formatNumber(warehouse.kilogramEarnings, 2)} грн
                    </span>
                  </>
                )}
                {warehouse.missingRateRows > 0 ? (
                  <span className={style.warning}>
                    Без ставки: {warehouse.missingRateRows}
                  </span>
                ) : null}
              </p>
            ))}
          </div>
        </div>

        <form className={style.filters} onSubmit={applyRange}>
          <label className={style.field}>
            <span className={style.dateLabel}>
              З
              <small>{formatReportBoundary(range.dateFrom)}</small>
            </span>
            <input
              type="date"
              value={range.dateFrom}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
            />
          </label>

          <label className={style.field}>
            <span className={style.dateLabel}>
              По
              <small>{formatReportBoundary(range.dateTo, 1)}</small>
            </span>
            <input
              type="date"
              value={range.dateTo}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
            />
          </label>

          <label className={style.field}>
            <span>Склад</span>
            <select
              value={selectedWarehouse}
              onChange={(event) => setSelectedWarehouse(event.target.value)}
            >
              <option value="">Усі</option>
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          </label>

          <label className={style.searchField}>
            <span>Пошук</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Склад, збирач, накладна"
            />
          </label>
          <button className="button is-primary is-small" type="submit">
            Показати
          </button>
        </form>
      </div>

      {loading ? <DataLoader label="Завантаження зібраних накладних…" /> : null}
      {!loading && error ? <p className={style.error}>{error}</p> : null}
      {!loading && !error && groups.length === 0 ? (
        <p className={style.state}>Немає даних для відображення</p>
      ) : null}

      {!loading && !error && groups.length > 0 ? (
        <div className={style.tableShell}>
          <table className={style.table}>
            <thead>
              <tr>
                <th>Склад / збирач / накладна</th>
                <th>Дата накладної</th>
                <th>Сканування</th>
                <th>Док. (шт.)</th>
                <th>Рядки (шт.)</th>
                <th>Вага (кг.)</th>
                <th>Сума накладної (грн)</th>
                <th>За рядки (грн.)</th>
                <th>За кг (грн.)</th>
                <th>Заробіток разом (грн.)</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((warehouse) => (
                <Fragment key={warehouse.label}>
                  <tr className={style.warehouseRow}>
                    <td>
                      <button
                        className={style.groupButton}
                        type="button"
                        onClick={() => toggleWarehouse(warehouse.label)}
                      >
                        <span>
                          {collapsedWarehouses.has(warehouse.label) ? "+" : "-"}
                        </span>
                        {warehouse.displayLabel}
                      </button>
                    </td>
                    <td />
                    <td />
                    <TotalsCells group={warehouse} />
                  </tr>

                  {!collapsedWarehouses.has(warehouse.label)
                    ? warehouse.children.map((picker) => {
                        const pickerKey = `${warehouse.label}:${picker.label}`;
                        return (
                          <Fragment key={pickerKey}>
                            <tr className={style.pickerRow}>
                              <td>
                                <button
                                  className={style.groupButton}
                                  type="button"
                                  onClick={() => togglePicker(pickerKey)}
                                >
                                  <span>
                                    {collapsedPickers.has(pickerKey) ? "+" : "-"}
                                  </span>
                                  {picker.displayLabel}
                                </button>
                              </td>
                              <td />
                              <td />
                              <TotalsCells group={picker} />
                            </tr>

                            {!collapsedPickers.has(pickerKey)
                              ? picker.rows.map((row, index) => (
                                  <tr
                                    className={style.documentRow}
                                    key={`${warehouse.label}:${picker.label}:${row.documentNumber}:${row.scanDate}:${index}`}
                                  >
                                    <td>{row.documentNumber}</td>
                                    <td>{formatDateTime(row.documentDate)}</td>
                                    <td>
                                      {formatDateTime(row.scanDate, {
                                        showSeconds: true,
                                      })}
                                    </td>
                                    <td>{formatNumber(row.documentsCount)}</td>
                                    <td>{formatNumber(row.rowsCount)}</td>
                                    <td>{formatNumber(row.weight, 3)}</td>
                                    <td>{formatNumber(row.amount, 2)}</td>
                                    <td>
                                      {row.rowEarnings === null
                                        ? "—"
                                        : formatNumber(row.rowEarnings, 2)}
                                    </td>
                                    <td>
                                      {row.kilogramEarnings === null
                                        ? "—"
                                        : formatNumber(row.kilogramEarnings, 2)}
                                    </td>
                                    <td>
                                      {getTotalEarnings(row) === null
                                        ? "—"
                                        : formatNumber(getTotalEarnings(row), 2)}
                                    </td>
                                  </tr>
                                ))
                              : null}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
