import { useContext, useEffect, useMemo, useState, Fragment } from "react";
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
import { DataLoader } from "../DataLoader/DataLoader";
import DateInput from "../DateInput/DateInput";
import FormInput from "../FormControl/FormInput";
import CompactSelect from "../CompactSelect/CompactSelect";

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function parseAssortments(value) {
  return String(value || "")
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSearch(value) {
  return String(value || "").trim().toLocaleLowerCase("uk-UA");
}

function matchesUser(user, search) {
  if (!search || !user) return false;
  return [user.name, user.login]
    .some((value) => normalizeSearch(value).includes(search));
}

function groupSales(rows) {
  const leaders = new Map();

  for (const row of rows) {
    const branchId = row.branch_id || "NO_BRANCH";
    const branchName = row.branch_short_name || row.branch_name || "";
    const supervisorIsNto = Number(row.supervisor_role) === ROLE_IDS.NTO;
    const hasManager = Boolean(row.manager_id);
    const leaderUser = hasManager
      ? {
          id: row.manager_id,
          name: row.manager_name || row.manager_login,
          login: row.manager_login,
          role: Number(row.manager_role),
          assortments: parseAssortments(row.manager_assortments),
        }
      : supervisorIsNto
        ? {
            id: row.supervisor_id,
            name: row.supervisor_name || row.supervisor_login,
            login: row.supervisor_login,
            role: Number(row.supervisor_role),
            assortments: parseAssortments(row.supervisor_assortments),
          }
        : null;
    const leaderKey = `${branchId}:${leaderUser?.id || "NO_NTO"}`;

    if (!leaders.has(leaderKey)) {
      leaders.set(leaderKey, {
        id: leaderKey,
        user: leaderUser,
        branchName,
        branchId,
        total: 0,
        supervisors: new Map(),
      });
    }

    const leader = leaders.get(leaderKey);
    const supervisorUser = row.supervisor_id && !supervisorIsNto
      ? {
          id: row.supervisor_id,
          name: row.supervisor_name || row.supervisor_login,
          login: row.supervisor_login,
          role: Number(row.supervisor_role),
          assortments: parseAssortments(row.supervisor_assortments),
        }
      : null;
    const supervisorKey = `${leaderKey}:${supervisorUser?.id || "DIRECT"}`;

    if (!leader.supervisors.has(supervisorKey)) {
      leader.supervisors.set(supervisorKey, {
        id: supervisorKey,
        user: supervisorUser,
        total: 0,
        agents: new Map(),
      });
    }

    const supervisor = leader.supervisors.get(supervisorKey);
    const agentId = `${branchId}:${row.agent_id}`;
    if (!supervisor.agents.has(agentId)) {
      supervisor.agents.set(agentId, {
        id: agentId,
        name: row.agent_name || row.agent_login,
        login: row.agent_login,
        role: Number(row.agent_role),
        assortments: parseAssortments(row.agent_assortments),
        total: 0,
        rows: [],
      });
    }

    const agent = supervisor.agents.get(agentId);
    agent.rows.push(row);

    if (row.status === "ACTIVE") {
      const amount = Number(row.amount);
      agent.total += amount;
      supervisor.total += amount;
      leader.total += amount;
    }
  }

  return Array.from(leaders.values()).map((leader) => ({
    ...leader,
    supervisors: Array.from(leader.supervisors.values()).map((supervisor) => ({
      ...supervisor,
      agents: Array.from(supervisor.agents.values()),
    })),
  }));
}

function filterSalesGroups(groups, searchValue, assortment) {
  const search = normalizeSearch(searchValue);

  return groups.flatMap((leader) => {
    const leaderMatches = matchesUser(leader.user, search);
    const supervisors = leader.supervisors.flatMap((supervisor) => {
      const supervisorMatches = leaderMatches || matchesUser(supervisor.user, search);
      const agents = supervisor.agents.filter((agent) => {
        const matchesSearch = !search || supervisorMatches || matchesUser(agent, search);
        const matchesAssortment = !assortment || agent.assortments.includes(assortment);
        return matchesSearch && matchesAssortment;
      });

      if (!agents.length) return [];
      return [{
        ...supervisor,
        agents,
        total: agents.reduce((sum, agent) => sum + agent.total, 0),
      }];
    });

    if (!supervisors.length) return [];
    return [{
      ...leader,
      supervisors,
      total: supervisors.reduce((sum, supervisor) => sum + supervisor.total, 0),
    }];
  });
}

function UserName({ user, fallback }) {
  const name = user?.name || fallback;
  const title = user?.assortments?.length
    ? `${name} · ${user.assortments.join(", ")}`
    : name;
  return (
    <span className={style.groupName} title={title}>
      <span>{name}</span>
      {user?.assortments?.length ? (
        <small className={style.assortmentSuffix}>
          — {user.assortments.join(", ")}
        </small>
      ) : null}
    </span>
  );
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
    return (
      <i
        className={`fa-solid fa-xmark ${style.cancelledIcon}`}
        aria-hidden="true"
      ></i>
    );
  }

  if (status === "MOVED") {
    return (
      <i
        className={`fa fa-refresh ${style.movedIcon}`}
        aria-hidden="true"
      ></i>
    );
  }

  return "";
}

export const SalesReport = ({ isOpen, setLastUpdateTime }) => {
  const { userInfo } = useContext(AuthContext);

  const [groups, setGroups] = useState([]);
  const [openLeader, setOpenLeader] = useState({});
  const [openSupervisor, setOpenSupervisor] = useState({});
  const [openAgent, setOpenAgent] = useState({});
  const [userSearch, setUserSearch] = useState("");
  const [assortmentFilter, setAssortmentFilter] = useState("");
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

      setMinDate(minDate ? String(minDate).slice(0, 10) : null);
      setMaxDate(maxDate ? String(maxDate).slice(0, 10) : null);
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

        const leaderState = {};
        const supervisorState = {};
        const agentState = {};

        for (const leader of grouped) {
          leaderState[leader.id] = true;
          for (const supervisor of leader.supervisors) {
            supervisorState[supervisor.id] = true;
            for (const agent of supervisor.agents) {
              agentState[agent.id] = role === ROLE_IDS.TA;
            }
          }
        }

        setOpenLeader(leaderState);
        setOpenSupervisor(supervisorState);
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

  const assortmentOptions = useMemo(() => {
    const names = new Set();
    for (const leader of groups) {
      for (const supervisor of leader.supervisors) {
        for (const agent of supervisor.agents) {
          agent.assortments.forEach((name) => names.add(name));
        }
      }
    }
    return [
      { value: "", label: "Усі асортименти" },
      ...Array.from(names)
        .sort((left, right) => left.localeCompare(right, "uk-UA"))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [groups]);

  const visibleGroups = useMemo(
    () => filterSalesGroups(groups, userSearch, assortmentFilter),
    [groups, userSearch, assortmentFilter],
  );

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

  const grandTotal = visibleGroups.reduce(
    (sum, leader) => sum + (leader.total || 0),
    0,
  );
  const filtersActive = Boolean(normalizeSearch(userSearch) || assortmentFilter);

  const showGrandTotal =
    role === ROLE_IDS.NTO ||
    role === ROLE_IDS.Director ||
    role === ROLE_IDS.Admin;

  if (!userInfo) return null;

  return (
    <div className={cn(style.salesReportWrapper, { open: isOpen })}>
      <div className={style.header}>
        <h1 className={style.title}>Звіт з продажів за період</h1>
        <div className={style.periodControls}>
          <span className={style.dateLabel}>з</span>
          <DateInput
            value={dateFrom}
            onChange={(event) => {
              const nextKey = event.target.value;
              if (!nextKey) return;
              setDateFrom(nextKey);
              if (dateTo < nextKey) setDateTo(nextKey);
            }}
            className={style.dateInput}
            min={minDate || undefined}
            max={dateTo || maxDate || undefined}
          />
          <span className={style.dateLabel}>по</span>
          <DateInput
            value={dateTo}
            onChange={(event) => {
              const nextKey = event.target.value;
              if (!nextKey) return;
              setDateTo(nextKey);
              if (dateFrom > nextKey) setDateFrom(nextKey);
            }}
            className={style.dateInput}
            min={dateFrom || minDate || undefined}
            max={maxDate || undefined}
          />
          <button
            type="button"
            className={cn(style.pdfButton, { "is-loading": pdfLoading })}
            onClick={handleOpenPdf}
            disabled={pdfLoading}
            title="Відкрити PDF"
          >
            PDF
          </button>
        </div>
        <div className={style.userFilters}>
          <FormInput
            type="search"
            compact
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Пошук користувача"
            aria-label="Пошук користувача у звіті"
            className={style.userSearch}
          />
          <CompactSelect
            value={assortmentFilter}
            options={assortmentOptions}
            onChange={setAssortmentFilter}
            placeholder="Усі асортименти"
            ariaLabel="Фільтр за асортиментом"
            className={style.assortmentFilter}
          />
        </div>
      </div>

      <div className={style.resultsViewport}>
        {loading && <DataLoader label="Формування звіту продажів…" />}

      {showGrandTotal && (
        <div className={style.grandTotal}>
          <span>Загальна сума: </span>
          <strong>{money(grandTotal)}</strong>
        </div>
      )}

      {!loading &&
        visibleGroups.map((leader) => {
          const leaderOpened = filtersActive || openLeader[leader.id];

          return (
            <div key={leader.id} className={style.leaderBlock}>
              {leader.user ? (
                <div
                  className={style.leaderHeader}
                  onClick={() => setOpenLeader((current) => ({
                    ...current,
                    [leader.id]: !leaderOpened,
                  }))}
                >
                  <span className={style.toggleMarker}>{leaderOpened ? "▾" : "▸"}</span>
                  <UserName user={leader.user} fallback="Без НТО" />
                  <span className={style.groupAmount}>{money(leader.total)}</span>
                </div>
              ) : null}

              {(leaderOpened || !leader.user) && leader.supervisors.map((supervisor) => {
                const supervisorOpened = filtersActive || openSupervisor[supervisor.id];
                return (
                  <div key={supervisor.id} className={style.supervisorBlock}>
                    {supervisor.user ? (
                      <div
                        className={style.supervisorHeader}
                        onClick={() => setOpenSupervisor((current) => ({
                          ...current,
                          [supervisor.id]: !supervisorOpened,
                        }))}
                      >
                        <span className={style.toggleMarker}>{supervisorOpened ? "▾" : "▸"}</span>
                        <UserName user={supervisor.user} fallback="Без керівника" />
                        <span className={style.groupAmount}>{money(supervisor.total)}</span>
                      </div>
                    ) : null}

                    {(supervisorOpened || !supervisor.user) && supervisor.agents.map((ag) => {
                  const agOpened = filtersActive || openAgent[ag.id];

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
                        <span className={style.toggleMarker}>{agOpened ? "▾" : "▸"}</span>
                        <UserName user={ag} fallback="Без ТА" />
                        <span className={style.groupAmount}>{money(ag.total)}</span>
                      </div>

                      {agOpened && (
                        <div className={style.tableShell}>
                          <table className={style.salesTable}>
                          <thead>
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
                          <tbody>
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
                                        className={`fa-solid fa-check ${style.form2Icon}`}
                                        aria-hidden="true"
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
                                    <td colSpan={showBranchColumn ? 9 : 8}>
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
                          <tfoot>
                            <tr>
                              <td colSpan={showBranchColumn ? 8 : 7}>
                                Всього:
                              </td>
                              <td>{money(ag.total)}</td>
                            </tr>
                          </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      {!loading && visibleGroups.length === 0 ? (
        <div className={style.emptyResults}>За заданими фільтрами користувачів не знайдено</div>
      ) : null}
      </div>

      <ScrollToTopButton />
    </div>
  );
};

export default SalesReport;
