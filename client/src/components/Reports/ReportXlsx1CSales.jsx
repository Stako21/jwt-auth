import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchStaticReport } from "../../services/reports.api";
import style from "./ReportXlsx1CSales.module.scss";

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate() + 1)}`;
}

function formatDateLabel(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("uk-UA");
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "";

  return number.toLocaleString("uk-UA", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

function compactPersonName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return parts.slice(0, -1).join(" ");
}

function buildGroups(rows, metrics) {
  const supervisors = new Map();

  for (const row of rows) {
    const supervisorName = row.supervisorName || "Без СВ";
    const agentName = row.agentName || "Без ТА";
    const metricKey = row.metricKey;

    if (!supervisors.has(supervisorName)) {
      supervisors.set(supervisorName, {
        label: supervisorName,
        displayLabel: compactPersonName(supervisorName),
        values: Object.fromEntries(metrics.map((metric) => [metric.key, 0])),
        children: new Map(),
      });
    }

    const supervisor = supervisors.get(supervisorName);

    if (!supervisor.children.has(agentName)) {
      supervisor.children.set(agentName, {
        label: agentName,
        displayLabel: compactPersonName(agentName),
        values: Object.fromEntries(metrics.map((metric) => [metric.key, 0])),
      });
    }

    const value = Number(row.metricValue || 0);
    supervisor.values[metricKey] = (supervisor.values[metricKey] || 0) + value;
    const agent = supervisor.children.get(agentName);
    agent.values[metricKey] = (agent.values[metricKey] || 0) + value;
  }

  return Array.from(supervisors.values())
    .map((supervisor) => ({
      ...supervisor,
      children: Array.from(supervisor.children.values()).sort((left, right) =>
        left.label.localeCompare(right.label, "uk-UA"),
      ),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "uk-UA"));
}

function ReportRow({ item, metrics, type }) {
  return (
    <tr className={type === "supervisor" ? style.supervisorRow : style.agentRow}>
      <td className={style.nameCell}>{item.displayLabel}</td>
      {metrics.map((metric) => (
        <td className={style.numberCell} key={metric.key}>
          {formatNumber(item.values[metric.key])}
        </td>
      ))}
    </tr>
  );
}

export function ReportXlsx1CSales({ report, setLastUpdateTime }) {
  const defaultDate = todayKey();
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    setLoading(true);
    setError("");

    fetchStaticReport(report.reportKey, { dateFrom, dateTo })
      .then((nextData) => {
        if (!isActive) return;
        setData(nextData);
        setLastUpdateTime?.(
          new Date().toLocaleTimeString("uk-UA", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      })
      .catch((loadError) => {
        if (!isActive) return;
        console.error("Failed to load XLSX 1C sales report:", loadError);
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
  }, [dateFrom, dateTo, report.reportKey, setLastUpdateTime]);

  const metrics = data?.metrics || [];
  const rows = data?.rows || [];
  const excludedAgents = data?.excludedAgents || [];
  const groups = useMemo(() => buildGroups(rows, metrics), [metrics, rows]);

  const totals = useMemo(() => {
    const result = Object.fromEntries(metrics.map((metric) => [metric.key, 0]));
    for (const group of groups) {
      for (const metric of metrics) {
        result[metric.key] += Number(group.values[metric.key] || 0);
      }
    }
    return result;
  }, [groups, metrics]);

  return (
    <section className={style.report}>
      <div className={style.header}>
        <div>
          <h2 className={style.title}>{data?.meta?.title || report.menuTitle}</h2>
          <p className={style.subtitle}>
            {formatDateLabel(dateFrom)} - {formatDateLabel(dateTo)}
          </p>
        </div>

        <div className={style.filters}>
          <label className={style.field}>
            <span>З</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label className={style.field}>
            <span>По</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </div>
      </div>

      {excludedAgents.length ? (
        <div className={style.excluded}>
          <strong>В таблицю не включені:</strong>{" "}
          {excludedAgents.join(", ")}
        </div>
      ) : null}

      {loading ? <p className={style.state}>Завантаження...</p> : null}
      {!loading && error ? <p className={style.error}>{error}</p> : null}
      {!loading && !error && groups.length === 0 ? (
        <p className={style.state}>Немає даних для вибраного періоду</p>
      ) : null}

      {!loading && !error && groups.length > 0 ? (
        <div className={style.tableShell}>
          <table className={style.table}>
            <thead>
              <tr>
                <th>СВ / ТА</th>
                {metrics.map((metric) => (
                  <th key={metric.key}>{metric.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={style.totalRow}>
                <td>Всього</td>
                {metrics.map((metric) => (
                  <td className={style.numberCell} key={metric.key}>
                    {formatNumber(totals[metric.key])}
                  </td>
                ))}
              </tr>
              {groups.map((supervisor) => (
                <Fragment key={supervisor.label}>
                  <ReportRow
                    item={supervisor}
                    metrics={metrics}
                    type="supervisor"
                  />
                  {supervisor.children.map((agent) => (
                    <ReportRow item={agent} metrics={metrics} key={agent.label} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
