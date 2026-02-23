import { useContext, useEffect, useState, Fragment } from "react";
import cn from "classnames";
import style from "./SalesReport.module.scss";
import { AuthContext, AuthClient } from "../../context/AuthContext";
import ScrollToTopButton from "../ScrollToTopButton/ScrollToTopButton";
import { ROLE_IDS } from "../../utils/roles";
import DatePicker, { registerLocale } from "react-datepicker";
import { uk } from "date-fns/locale/uk";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("uk", uk);

/**
 * Группировка:
 * Supervisor -> Agent -> Rows
 */
function groupSales(rows) {
  const map = new Map();

  for (const r of rows) {
    const svId = r.supervisor_id || "NO_SV";
    const svName = r.supervisor_name || "Без керівника";

    if (!map.has(svId)) {
      map.set(svId, {
        id: svId,
        name: svName,
        total: 0,
        agents: new Map(),
      });
    }

    const sv = map.get(svId);

    const agentId = r.agent_id;
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

/* helpers */
function money(v) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
  }).format(v || 0);
}

function shortDoc(num) {
  if (!num) return "";
  return `${num.slice(0, 2)}…${num.slice(-5)}`;
}

function statusIcon(status) {
  // if (status === "CANCELLED") return "❌";
  if (status === "CANCELLED")
    return <i className="fa-solid fa-xmark" style={{ color: "#ED0202" }}></i>;
  // if (status === "MOVED") return "🔄";
  if (status === "MOVED")
    return (
      <i
        className="fa fa-refresh"
        aria-hidden="true"
        style={{ color: "#2402ED" }}
      ></i>
    );
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
    /** @type {number|null} */ (null)
  );
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    AuthClient.get("/reports/date-range").then((res) => {
      const { minDate, maxDate } = res.data.data;

      setMinDate(minDate ? new Date(minDate) : null);
      setMaxDate(maxDate ? new Date(maxDate) : null);
    });
  }, []);

  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });

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

  useEffect(() => {
    if (!userInfo) return;

    setLoading(true);

    AuthClient.get("/reports/sales", {
      params: { date },
    })
      .then((res) => {
        const rows = res.data?.data || [];
        const grouped = groupSales(rows);

        setGroups(grouped);

        const svState = {};
        const agentState = {};

        // всегда раскрываем верхний уровень (SV)
        for (const sv of grouped) {
          svState[sv.id] = true;

          // SV и TA — раскрываем агентов
          if (role === ROLE_IDS.TA || role === ROLE_IDS.SV) {
            for (const ag of sv.agents) {
              agentState[ag.id] = false;
            }
          }

          // TA — раскрываем ВСЁ (строки)
          if (role === ROLE_IDS.TA) {
            for (const ag of sv.agents) {
              agentState[ag.id] = true;
            }
          }
        }

        setOpenSV(svState);
        setOpenAgent(agentState);

        const lastUpdate = res.data?.meta?.lastUpdate
          ? formatDateTime(res.data.meta.lastUpdate)
          : null;

        if (lastUpdate && typeof setLastUpdateTime === "function") {
          console.log("lastUpdate", lastUpdate);
          setLastUpdateTime(lastUpdate);
        }

        // if (
        //   res.data?.meta?.lastUpdate &&
        //   typeof setLastUpdateTime === "function"
        // ) {

        //   setLastUpdateTime(formatDateTime(res.data.meta.lastUpdate));
        // }
      })
      .finally(() => setLoading(false));
  }, [userInfo, date, setLastUpdateTime]);

  async function handleOpenPdf() {
    try {
      setPdfLoading(true);
      const res = await AuthClient.get("/reports/sales/pdf", {
        params: { date },
        responseType: "blob",
      });

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
      {/* <DocumentPdfViewer /> */}
      <div className={style.header}>
        <h2 className={style.title}>Звіт з продажів за </h2>
        {/* <input
          type="date"
          className={style.dateInput}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        /> */}
        <DatePicker
          locale="uk"
          selected={new Date(date)}
          onChange={(date) => setDate(date.toISOString().split("T")[0])}
          dateFormat="dd.MM.yyyy"
          className={style.dateInput}
          minDate={minDate ? new Date(minDate) : null}
          maxDate={maxDate ? new Date(maxDate) : null}
        ></DatePicker>
        <button
          className={`button is-small is-light ${pdfLoading ? "is-loading" : ""}`}
          onClick={handleOpenPdf}
          disabled={pdfLoading}
          title="Відкрити PDF"
        >
          PDF
        </button>
      </div>

      {loading && <p>Завантаження…</p>}

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
              {/* SV header */}
              <div
                className={style.supervisorHeader}
                onClick={() => setOpenSV((p) => ({ ...p, [sv.id]: !svOpened }))}
              >
                <span>{svOpened ? "▼" : "▶"}</span>
                <strong>{sv.name}</strong>
                <span>{money(sv.total)}</span>
              </div>

              {/* SV body */}
              {svOpened &&
                sv.agents.map((ag) => {
                  const agOpened = openAgent[ag.id];

                  return (
                    <div key={ag.id} className={style.agentBlock}>
                      {/* Agent header */}
                      <div
                        className={style.agentHeader}
                        onClick={() =>
                          setOpenAgent((p) => ({
                            ...p,
                            [ag.id]: !agOpened,
                          }))
                        }
                      >
                        <span>{agOpened ? "▼" : "▶"}</span>
                        <span>{ag.name}</span>
                        <span>{money(ag.total)}</span>
                      </div>

                      {/* Agent table */}
                      {agOpened && (
                        <table
                          className={cn(
                            "table is-light is-bordered is-striped is-narrow is-fullwidth",
                            style.salesTable
                          )}
                        >
                          <thead className={style.tableHeader}>
                            <tr>
                              <th>№</th>
                              <th>Документ</th>
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
                                      prev === r.id ? null : r.id
                                    )
                                  }
                                >
                                  <td>{i + 1}</td>
                                  <td>
                                    {statusIcon(r.status)}{" "}
                                    {shortDoc(r.document_number)}
                                  </td>
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
                                    <td colSpan={6}>
                                      <strong>
                                        Причина зміни статусу:{" "}
                                        {r.change_comment}
                                      </strong>{" "}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                          <tfoot className={style.tableFooter}>
                            <tr>
                              <td colSpan={5}>Всього:</td>
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
