import { useContext, useEffect, useState, Fragment } from "react";
import cn from "classnames";
import style from "./SalesReport.module.scss";
import { AuthContext } from "../../context/AuthContext";
import ScrollToTopButton from "../ScrollToTopButton/ScrollToTopButton";
import { ROLE_IDS } from "../../utils/roles";
import {
  fetchReportDateRange,
  fetchSalesReport,
  fetchSalesReportPdf,
} from "../../services/reports.api";
import DatePicker, { registerLocale } from "react-datepicker";
import { uk } from "date-fns/locale/uk";
import "react-datepicker/dist/react-datepicker.css";
import { DataLoader } from "../DataLoader/DataLoader";

registerLocale("uk", uk);

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getTomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function groupSales(rows) {
  const map = new Map();

  for (const r of rows) {
    const branchId = r.branch_id || "NO_BRANCH";
    const branchName = r.branch_short_name || r.branch_name || "";
    const svKey = `${branchId}:${r.supervisor_id || "NO_SV"}`;
    const svNameBase = r.supervisor_name || "Без керівника";
    const svName = branchName ? `${branchName} / ${svNameBase}` : svNameBase;

    if (!map.has(svKey)) {
      map.set(svKey, {
        id: svKey,
        name: svName,
        branchName,
        branchId,
        total: 0,
        agents: new Map(),
      });
    }

    const sv = map.get(svKey);

    const agentId = `${branchId}:${r.agent_id}`;
    if (!sv.agents.has(agentId)) {
      sv.agents.set(agentId, {
        id: agentId,
        name: r.agent_name || r.agent_login,
        login: r.agent_login,
        total: 0,
        rows: [],
      });
    }

    const agent = sv.agents.get(agentId);
    agent.rows.push(r);

    if (r.status === "ACTIVE") {
      agent.total += Number(r.amount);
      sv.total += Number(r.amount);
    }
  }

  return Array.from(map.values()).map((sv) => ({
    ...sv,
    agents: Array.from(sv.agents.values()),
  }));
}

function money(v) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
  }).format(v || 0);
}

function shortDoc(num) {
  if (!num) return "";
  return `${num.slice(0, 2)}...${num.slice(-5)}`;
}

function statusIcon(status) {
  if (status === "CANCELLED") {
    return <i className="fa-solid fa-xmark" style={{ color: "#ED0202" }}></i>;
  }

  if (status === "MOVED") {
    return (
      <i
        className="fa fa-refresh"
        aria-hidden="true"
        style={{ color: "#2402ED" }}
      ></i>
    );
  }

  return "";
}

export const SalesReport = ({ isOpen, setLastUpdateTime }) => {
  const { userInfo } = useContext(AuthContext);

  const [groups, setGroups] = useState([]);
  const [openSV, setOpenSV] = useState({});
  const [openAgent, setOpenAgent] = useState({});
  const [loading, setLoading] = useState(false);
  const [minDate, setMinDate] = useState(null);
  const [maxDate, setMaxDate] = useState(null);
  const [openComment, setOpenComment] = useState(
    /** @type {number|null} */ (null),
  );
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showBranchColumn, setShowBranchColumn] = useState(false);

  useEffect(() => {
    fetchReportDateRange().then((data) => {
      const { minDate, maxDate } = data.data;

      setMinDate(minDate ? new Date(minDate) : null);
      setMaxDate(maxDate ? new Date(maxDate) : null);
    });
  }, []);

  const [dateFrom, setDateFrom] = useState(getTomorrowKey);
  const [dateTo, setDateTo] = useState(getTomorrowKey);

  const role = userInfo?.role;

  function formatDateTime(dateTimeStr) {
    return new Date(dateTimeStr).toLocaleString("uk-UA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }

  useEffect(() => {
    if (!userInfo) return;

    setLoading(true);

    fetchSalesReport({ dateFrom, dateTo })
      .then((data) => {
        const rows = data?.data || [];
        const grouped = groupSales(rows);
        const branchIds = new Set(
          rows.map((row) => Number(row.branch_id)).filter(Boolean),
        );

        setGroups(grouped);
        setShowBranchColumn(branchIds.size > 1);

        const svState = {};
        const agentState = {};

        for (const sv of grouped) {
          svState[sv.id] = true;

          if (role === ROLE_IDS.TA || role === ROLE_IDS.SV) {
            for (const ag of sv.agents) {
              agentState[ag.id] = false;
            }
          }

          if (role === ROLE_IDS.TA) {
            for (const ag of sv.agents) {
              agentState[ag.id] = true;
            }
          }
        }

        setOpenSV(svState);
        setOpenAgent(agentState);

        const lastUpdate = data?.meta?.lastUpdate
          ? formatDateTime(data.meta.lastUpdate)
          : null;

        if (lastUpdate && typeof setLastUpdateTime === "function") {
          setLastUpdateTime(lastUpdate);
        }
      })
      .finally(() => setLoading(false));
  }, [userInfo, dateFrom, dateTo, role, setLastUpdateTime]);

  async function handleOpenPdf() {
    try {
      setPdfLoading(true);
      const res = await fetchSalesReportPdf({ dateFrom, dateTo });

      const contentType = res.headers["content-type"] || "application/pdf";
      const blob = new Blob([res.data], { type: contentType });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
    } catch (error) {
      console.error("Error opening sales report PDF:", error);
      alert("Не вдалося відкрити PDF звіт");
    } finally {
      setPdfLoading(false);
    }
  }

  const grandTotal = groups.reduce((sum, sv) => sum + (sv.total || 0), 0);

  const showGrandTotal =
    role === ROLE_IDS.NTO ||
    role === ROLE_IDS.Director ||
    role === ROLE_IDS.Admin;

  if (!userInfo) return null;

  return (
    <div className={cn(style.salesReportWrapper, { open: isOpen })}>
      <div className={style.header}>
        <h2 className={style.title}>Звіт з продажів за період</h2>
        <span className={style.dateLabel}>з</span>
        <DatePicker
          locale="uk"
          selected={parseDateKey(dateFrom)}
          onChange={(nextDate) => {
            if (!nextDate) return;
            const nextKey = toDateKey(nextDate);
            setDateFrom(nextKey);
            if (dateTo < nextKey) setDateTo(nextKey);
          }}
          dateFormat="dd.MM.yyyy"
          className={style.dateInput}
          minDate={minDate ? new Date(minDate) : null}
          maxDate={dateTo ? parseDateKey(dateTo) : maxDate ? new Date(maxDate) : null}
        />
        <span className={style.dateLabel}>по</span>
        <DatePicker
          locale="uk"
          selected={parseDateKey(dateTo)}
          onChange={(nextDate) => {
            if (!nextDate) return;
            const nextKey = toDateKey(nextDate);
            setDateTo(nextKey);
            if (dateFrom > nextKey) setDateFrom(nextKey);
          }}
          dateFormat="dd.MM.yyyy"
          className={style.dateInput}
          minDate={dateFrom ? parseDateKey(dateFrom) : minDate ? new Date(minDate) : null}
          maxDate={maxDate ? new Date(maxDate) : null}
        />
        <button
          className={`button is-small is-light ${pdfLoading ? "is-loading" : ""}`}
          onClick={handleOpenPdf}
          disabled={pdfLoading}
          title="Відкрити PDF"
        >
          PDF
        </button>
      </div>

      {loading && <DataLoader label="Формування звіту продажів…" />}

      {showGrandTotal && (
        <div className={style.grandTotal}>
          <span>Загальна сума: </span>
          <strong>{money(grandTotal)}</strong>
        </div>
      )}

      {!loading &&
        groups.map((sv) => {
          const svOpened = openSV[sv.id];

          return (
            <div key={sv.id} className={style.supervisorBlock}>
              <div
                className={style.supervisorHeader}
                onClick={() => setOpenSV((p) => ({ ...p, [sv.id]: !svOpened }))}
              >
                <span>{svOpened ? "▾" : "▸"}</span>
                <strong>{sv.name}</strong>
                <span>{money(sv.total)}</span>
              </div>

              {svOpened &&
                sv.agents.map((ag) => {
                  const agOpened = openAgent[ag.id];

                  return (
                    <div key={ag.id} className={style.agentBlock}>
                      <div
                        className={style.agentHeader}
                        onClick={() =>
                          setOpenAgent((p) => ({
                            ...p,
                            [ag.id]: !agOpened,
                          }))
                        }
                      >
                        <span>{agOpened ? "▾" : "▸"}</span>
                        <span>{ag.name}</span>
                        <span>{money(ag.total)}</span>
                      </div>

                      {agOpened && (
                        <table
                          className={cn(
                            "table is-light is-bordered is-striped is-narrow is-fullwidth",
                            style.salesTable,
                          )}
                        >
                          <thead className={style.tableHeader}>
                            <tr>
                              <th>№</th>
                              <th>Дата</th>
                              <th>Документ</th>
                              {showBranchColumn && <th>Філія</th>}
                              <th>Контрагент</th>
                              <th>ТТ</th>
                              <th>Коментар</th>
                              <th>Ф2</th>
                              <th>Сума</th>
                            </tr>
                          </thead>
                          <tbody className={style.salesTableBody}>
                            {ag.rows.map((r, i) => (
                              <Fragment key={r.id}>
                                <tr
                                  className={cn({
                                    [style.cancelledRow]:
                                      r.status === "CANCELLED",
                                    [style.movedRow]: r.status === "MOVED",
                                  })}
                                  title={
                                    r.status !== "ACTIVE"
                                      ? r.change_comment
                                      : ""
                                  }
                                  onClick={() =>
                                    setOpenComment((prev) =>
                                      prev === r.id ? null : r.id,
                                    )
                                  }
                                >
                                  <td>{i + 1}</td>
                                  <td>{formatDate(r.report_date || r.document_date)}</td>
                                  <td>
                                    {statusIcon(r.status)} {shortDoc(r.document_number)}
                                  </td>
                                  {showBranchColumn && (
                                    <td>
                                      {r.branch_short_name || r.branch_name || "-"}
                                    </td>
                                  )}
                                  <td>{r.customer}</td>
                                  <td>{r.point_of_sale}</td>
                                  <td>{r.comment}</td>
                                  <td>
                                    {r.form2 ? (
                                      <i
                                        className="fa-solid fa-check"
                                        style={{ color: "#14C700" }}
                                      ></i>
                                    ) : (
                                      ""
                                    )}
                                  </td>
                                  <td>{money(r.amount)}</td>
                                </tr>
                                {openComment === r.id && r.change_comment && (
                                  <tr
                                    key={`${r.id}-comment`}
                                    className={style.commentRow}
                                  >
                                    <td colSpan={showBranchColumn ? 8 : 7}>
                                      <strong>
                                        Причина зміни статусу:{" "}
                                        {r.change_comment}
                                      </strong>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                          <tfoot className={style.tableFooter}>
                            <tr>
                              <td colSpan={showBranchColumn ? 8 : 7}>
                                Всього:
                              </td>
                              <td>{money(ag.total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}

      <ScrollToTopButton />
    </div>
  );
};

export default SalesReport;
