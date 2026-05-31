import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchStaticReport } from "../../services/reports.api";
import style from "./ReportBillOfLading.module.scss";

const REPORT_KEY = "report-bill-of-lading";

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getShiftDateKey(value) {
  const date = parseDate(value);
  if (!date) return "";

  if (date.getHours() < 8) {
    date.setDate(date.getDate() - 1);
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("uk-UA");
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

function getRowShiftDate(row) {
  return row.reportDate || getShiftDateKey(row.scanDate);
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
    children: new Map(),
    rows: [],
  };
}

function addTotals(target, row) {
  target.documentsCount += Number(row.documentsCount || 0);
  target.rowsCount += Number(row.rowsCount || 0);
  target.weight += Number(row.weight || 0);
  target.amount += Number(row.amount || 0);
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
    </>
  );
}

export function ReportBillOfLading({ setLastUpdateTime }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [query, setQuery] = useState("");
  const [collapsedWarehouses, setCollapsedWarehouses] = useState(() => new Set());
  const [collapsedPickers, setCollapsedPickers] = useState(() => new Set());

  useEffect(() => {
    let isActive = true;

    setLoading(true);
    setError("");

    fetchStaticReport(REPORT_KEY)
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
            "Не вдалося завантажити звіт",
        );
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [setLastUpdateTime]);

  const dateOptions = useMemo(() => {
    return Array.from(new Set(rows.map(getRowShiftDate).filter(Boolean))).sort(
      (left, right) => right.localeCompare(left),
    );
  }, [rows]);

  const warehouseOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows.map((row) => String(row.warehouseName || "").trim()).filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "uk-UA"));
  }, [rows]);

  useEffect(() => {
    if (!selectedDate && dateOptions[0]) {
      setSelectedDate(dateOptions[0]);
    }
  }, [dateOptions, selectedDate]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return rows.filter((row) => {
      if (selectedDate && getRowShiftDate(row) !== selectedDate) return false;
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
  }, [query, rows, selectedDate, selectedWarehouse]);

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
              </p>
            ))}
          </div>
        </div>

        <div className={style.filters}>
          <label className={style.field}>
            <span>День</span>
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            >
              {dateOptions.map((dateKey) => (
                <option key={dateKey} value={dateKey}>
                  {formatDateLabel(dateKey)} 08:00-08:00
                </option>
              ))}
            </select>
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
        </div>
      </div>

      {loading ? <p className={style.state}>Завантаження...</p> : null}
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
                <th>Док.</th>
                <th>Рядки</th>
                <th>Вага</th>
                <th>Сума</th>
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
