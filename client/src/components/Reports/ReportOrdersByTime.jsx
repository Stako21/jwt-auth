import { Fragment, useEffect, useMemo, useState } from "react";
import style from "./ReportOrdersByTime.module.scss";
import { fetchStaticReport } from "../../services/reports.api";
import { DataLoader } from "../DataLoader/DataLoader";

const REPORT_KEY = "report-orders-by-time";

const HOUR_BUCKETS = [
  { key: "before9", label: "до 9:00", test: (hour) => hour < 9 },
  { key: "9", label: "09:00 - 10:00", test: (hour) => hour === 9 },
  { key: "10", label: "10:00 - 11:00", test: (hour) => hour === 10 },
  { key: "11", label: "11:00 - 12:00", test: (hour) => hour === 11 },
  { key: "12", label: "12:00 - 13:00", test: (hour) => hour === 12 },
  { key: "13", label: "13:00 - 14:00", test: (hour) => hour === 13 },
  { key: "14", label: "14:00 - 15:00", test: (hour) => hour === 14 },
  { key: "15", label: "15:00 - 16:00", test: (hour) => hour === 15 },
  { key: "16", label: "16:00 - 17:00", test: (hour) => hour === 16 },
  { key: "17", label: "17:00 - 18:00", test: (hour) => hour === 17 },
  { key: "18", label: "18:00 - 19:00", test: (hour) => hour === 18 },
  { key: "19plus", label: "19:00+", test: (hour) => hour >= 19 },
];

const LATE_BUCKET_KEYS = new Set(["17", "18", "19plus"]);

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateKey(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("uk-UA");
}

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createStats(label, meta = "") {
  return {
    label,
    meta,
    buckets: Object.fromEntries(HOUR_BUCKETS.map((bucket) => [bucket.key, 0])),
    bucketOrders: Object.fromEntries(
      HOUR_BUCKETS.map((bucket) => [bucket.key, []]),
    ),
    total: 0,
    lateTotal: 0,
    firstOrder: null,
    children: new Map(),
  };
}

function addOrder(stats, row, orderDate) {
  const bucket = HOUR_BUCKETS.find((item) => item.test(orderDate.getHours()));

  if (!bucket) return;

  stats.buckets[bucket.key] += 1;
  stats.bucketOrders[bucket.key].push({
    number: String(row.number || "").trim() || "Без номера",
    time: formatTime(orderDate),
    timestamp: orderDate.getTime(),
  });
  stats.total += 1;

  if (LATE_BUCKET_KEYS.has(bucket.key)) {
    stats.lateTotal += 1;
  }

  if (!stats.firstOrder || orderDate < stats.firstOrder) {
    stats.firstOrder = orderDate;
  }
}

function getLatePercent(stats) {
  if (!stats.total) return "0%";
  return `${Math.round((stats.lateTotal / stats.total) * 100)}%`;
}

function compactPersonName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 2) {
    return parts.join(" ");
  }

  return parts.slice(0, -1).join(" ");
}

function formatShare(value) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function getShareClassName(value) {
  if (value >= 10) {
    return style.shareHigh;
  }

  if (value >= 6.4) {
    return style.shareMedium;
  }

  return style.shareLow;
}

function sortByLabel(left, right) {
  return left.label.localeCompare(right.label, "uk-UA");
}

function finalizeCity(city) {
  return {
    ...city,
    children: Array.from(city.children.values())
      .map(finalizeSupervisor)
      .sort(sortByLabel),
  };
}

function finalizeSupervisor(supervisor) {
  return {
    ...supervisor,
    children: Array.from(supervisor.children.values()).sort(sortByLabel),
  };
}

function buildReportGroups(rows) {
  const cities = new Map();

  for (const row of rows) {
    const orderDate = parseDate(row.date);
    if (!orderDate) continue;

    const supervisorName = String(row.supervisor || "").trim() || "Без супервайзера";
    const agentName = String(row.salesAgent || "").trim() || "Без ТА";
    const cityName = String(row.city || "").trim() || "Р‘РµР· РіРѕСЂРѕРґР°";

    if (!cities.has(cityName)) {
      cities.set(cityName, createStats(cityName));
    }

    const city = cities.get(cityName);

    if (!city.children.has(supervisorName)) {
      city.children.set(
        supervisorName,
        createStats(compactPersonName(supervisorName)),
      );
    }

    const supervisor = city.children.get(supervisorName);

    if (!supervisor.children.has(agentName)) {
      supervisor.children.set(agentName, createStats(compactPersonName(agentName)));
    }

    addOrder(city, row, orderDate);
    addOrder(supervisor, row, orderDate);
    addOrder(supervisor.children.get(agentName), row, orderDate);
  }

  return Array.from(cities.values()).map(finalizeCity).sort(sortByLabel);
}

function ReportRow({ stats, level = "agent", onBucketClick }) {
  const rowClassName = [
    level === "city" ? style.cityRow : "",
    level === "supervisor" ? style.groupRow : "",
    level === "agent" ? style.agentRow : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr className={rowClassName}>
      <td className={style.nameCell}>
        <span>{stats.label}</span>
        {stats.meta ? <small>{stats.meta}</small> : null}
      </td>
      {HOUR_BUCKETS.map((bucket) => {
        const count = stats.buckets[bucket.key] || 0;
        const details = {
          title: stats.label,
          bucketLabel: bucket.label,
          orders: [...stats.bucketOrders[bucket.key]].sort(
            (left, right) => left.timestamp - right.timestamp,
          ),
        };

        return (
          <td
            key={bucket.key}
            className={count ? style.clickableCell : undefined}
            role={count ? "button" : undefined}
            tabIndex={count ? 0 : undefined}
            onClick={count ? () => onBucketClick(details) : undefined}
            onKeyDown={
              count
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onBucketClick(details);
                    }
                  }
                : undefined
            }
          >
            {count || ""}
          </td>
        );
      })}
      <td className={style.totalCell}>{stats.total || ""}</td>
      <td>{getLatePercent(stats)}</td>
      <td>{formatTime(stats.firstOrder)}</td>
    </tr>
  );
}

export function ReportOrdersByTime({ setLastUpdateTime }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [orderDetails, setOrderDetails] = useState(null);

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
        console.error("Failed to load orders by time report:", loadError);
        setRows([]);
        setError(
          loadError?.response?.data?.message ||
            "Не вдалося завантажити звіт",
        );
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [setLastUpdateTime]);

  const dateOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => getDateKey(parseDate(row.date)))
          .filter(Boolean),
      ),
    ).sort((left, right) => right.localeCompare(left));
  }, [rows]);

  const cityOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => String(row.city || "").trim()).filter(Boolean)),
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
      const orderDate = parseDate(row.date);

      if (!orderDate) return false;
      if (selectedDate && getDateKey(orderDate) !== selectedDate) return false;
      if (selectedCity && String(row.city || "").trim() !== selectedCity) {
        return false;
      }

      if (!normalizedQuery) return true;

      return [row.number, row.salesAgent, row.supervisor, row.city]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, rows, selectedCity, selectedDate]);

  const groups = useMemo(() => buildReportGroups(filteredRows), [filteredRows]);
  const totalOrders = filteredRows.length;
  const cityTotals = useMemo(
    () => groups.map((group) => ({ city: group.label, total: group.total })),
    [groups],
  );
  const hourShares = useMemo(
    () =>
      HOUR_BUCKETS.map((bucket) => {
        const bucketTotal = groups.reduce(
          (sum, group) => sum + (group.buckets[bucket.key] || 0),
          0,
        );

        return {
          key: bucket.key,
          value: totalOrders ? (bucketTotal / totalOrders) * 100 : 0,
        };
      }),
    [groups, totalOrders],
  );

  return (
    <section className={style.report}>
      <div className={style.header}>
        <div>
          <h2 className={style.title}>Завантаження замовлень по годинам</h2>
          <p className={style.subtitle}>
            Заявок: <strong>{totalOrders}</strong>
          </p>
          {cityTotals.length > 0 ? (
            <p className={style.citySummary}>
              {cityTotals.map((item) => (
                <span key={item.city}>
                  {item.city}: <strong>{item.total}</strong>
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <div className={style.filters}>
          <label className={style.field}>
            <span>Дата</span>
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            >
              {dateOptions.map((dateKey) => (
                <option key={dateKey} value={dateKey}>
                  {formatDateLabel(dateKey)}
                </option>
              ))}
            </select>
          </label>

          <label className={style.field}>
            <span>Місто</span>
            <select
              value={selectedCity}
              onChange={(event) => setSelectedCity(event.target.value)}
            >
              <option value="">Всі</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
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
              placeholder="ТА, супервайзер, номер, місто"
            />
          </label>
        </div>
      </div>

      {loading ? <DataLoader label="Завантаження замовлень по годинах…" /> : null}
      {!loading && error ? <p className={style.error}>{error}</p> : null}
      {!loading && !error && groups.length === 0 ? (
        <p className={style.state}>Немає даних для відображення</p>
      ) : null}

      {!loading && !error && groups.length > 0 ? (
        <div className={style.tableShell}>
          <table className={style.table}>
            <thead>
              <tr>
                <th>Місто / СВ / ТА</th>
                {HOUR_BUCKETS.map((bucket) => (
                  <th key={bucket.key}>{bucket.label}</th>
                ))}
                <th>Всього</th>
                <th>% пізніх</th>
                <th>Перша заявка</th>
              </tr>
              <tr className={style.shareRow}>
                <th>доля заявок за годину</th>
                {hourShares.map((share) => (
                  <th
                    key={share.key}
                    className={getShareClassName(share.value)}
                  >
                    {formatShare(share.value)}
                  </th>
                ))}
                <th />
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((city) => (
                <Fragment key={city.label}>
                  <ReportRow
                    stats={city}
                    level="city"
                    onBucketClick={setOrderDetails}
                  />
                  {city.children.map((supervisor) => (
                    <Fragment key={`${city.label}:${supervisor.label}`}>
                      <ReportRow
                        stats={supervisor}
                        level="supervisor"
                        onBucketClick={setOrderDetails}
                      />
                      {supervisor.children.map((agent) => (
                        <ReportRow
                          key={`${city.label}:${supervisor.label}:${agent.label}`}
                          stats={agent}
                          onBucketClick={setOrderDetails}
                        />
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {orderDetails ? (
        <div className={style.detailsBackdrop} role="presentation">
          <section
            className={style.detailsPanel}
            role="dialog"
            aria-modal="true"
            aria-label="Деталі замовлень"
          >
            <div className={style.detailsHeader}>
              <div>
                <h3>{orderDetails.title}</h3>
                <p>
                  {orderDetails.bucketLabel}: {orderDetails.orders.length}
                </p>
              </div>
              <button
                className={style.closeButton}
                type="button"
                onClick={() => setOrderDetails(null)}
                aria-label="Закрити"
              >
                x
              </button>
            </div>

            <div className={style.detailsList}>
              {orderDetails.orders.map((order, index) => (
                <div
                  className={style.detailsRow}
                  key={`${order.number}:${order.time}:${index}`}
                >
                  <span>{order.number}</span>
                  <strong>{order.time}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
