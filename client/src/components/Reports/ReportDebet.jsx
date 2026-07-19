import { useEffect, useMemo, useState } from "react";
import style from "./ReportDebet.module.scss";
import { fetchStaticReport } from "../../services/reports.api";
import { DataLoader } from "../DataLoader/DataLoader";

const GROUPING_MODES = {
  collector: "collector",
  contractor: "contractor",
};

function formatMoney(value) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("uk-UA");
}

function getDocumentAmount(row) {
  return Number(row.debtOriginal ?? row.debt) || 0;
}

function getOverdueClassName(overdueDays) {
  const days = Number(overdueDays) || 0;

  if (days >= 14) {
    return style.overdueDanger;
  }

  if (days >= 7 && days <= 13) {
    return style.overdueWarning;
  }

  return "";
}

function getTaInfo(row) {
  const displayName = String(row.collector || row.login || "").trim();
  const login = String(row.login || "").trim();

  return {
    id: `${displayName || "Без ТА"}:${login}`,
    label: displayName || "Без ТА",
    login,
  };
}

function getContractorLabel(row) {
  const customer = String(row.customer || "").trim();
  const pointOfSale = String(row.pointOfSale || "").trim();

  if (customer && pointOfSale) {
    return `${customer} - ${pointOfSale}`;
  }

  return customer || pointOfSale || "Без контрагента";
}

function getTradePointAddress(row) {
  return String(row.tradePointAddress || "").trim();
}

function createGroup(id, title, meta = "") {
  return {
    id,
    title,
    meta,
    address: "",
    totalDebt: 0,
    totalPrepayment: 0,
    children: new Map(),
  };
}

function addRowTotals(group, row) {
  group.totalDebt += Number(row.debt) || 0;
  group.totalPrepayment += Number(row.prepayment) || 0;
}

function sortByTitle(left, right) {
  return left.title.localeCompare(right.title, "uk-UA");
}

function sortDocuments(left, right) {
  return String(left.documentNumber || "").localeCompare(
    String(right.documentNumber || ""),
    "uk-UA",
  );
}

function finalizeGroups(groups) {
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      children: Array.from(group.children.values())
        .map((child) => ({
          ...child,
          rows: [...child.rows].sort(sortDocuments),
        }))
        .sort(sortByTitle),
    }))
    .sort(sortByTitle);
}

function buildCollectorGroups(rows) {
  const groups = new Map();

  for (const row of rows) {
    const ta = getTaInfo(row);
    const groupId = `collector:${ta.id}`;

    if (!groups.has(groupId)) {
      groups.set(groupId, createGroup(groupId, ta.label, ta.login));
    }

    const group = groups.get(groupId);
    addRowTotals(group, row);

    const contractorLabel = getContractorLabel(row);
    const childId = `${groupId}:contractor:${contractorLabel}`;

    if (!group.children.has(childId)) {
      group.children.set(childId, {
        id: childId,
        title: contractorLabel,
        address: getTradePointAddress(row),
        totalDebt: 0,
        totalPrepayment: 0,
        rows: [],
      });
    }

    const child = group.children.get(childId);
    child.address ||= getTradePointAddress(row);
    addRowTotals(child, row);
    child.rows.push(row);
  }

  return finalizeGroups(groups);
}

function buildContractorGroups(rows) {
  const groups = new Map();

  for (const row of rows) {
    const contractorLabel = getContractorLabel(row);
    const groupId = `contractor:${contractorLabel}`;

    if (!groups.has(groupId)) {
      groups.set(groupId, createGroup(groupId, contractorLabel));
    }

    const group = groups.get(groupId);
    group.address ||= getTradePointAddress(row);
    addRowTotals(group, row);

    const ta = getTaInfo(row);
    const childId = `${groupId}:collector:${ta.id}`;

    if (!group.children.has(childId)) {
      group.children.set(childId, {
        id: childId,
        title: ta.label,
        meta: ta.login,
        totalDebt: 0,
        totalPrepayment: 0,
        rows: [],
      });
    }

    const child = group.children.get(childId);
    addRowTotals(child, row);
    child.rows.push(row);
  }

  return finalizeGroups(groups);
}

function DocumentRows({ rows, groupId }) {
  return (
    <div className={style.tableShell}>
      <table className={style.table}>
        <thead>
          <tr>
            <th>Номер док.</th>
            <th>Ф2.</th>
            <th>Факт</th>
            <th>Дата док.</th>
            <th>Відтерм.</th>
            <th>Дата оплати</th>
            <th>Сума док.</th>
            <th>Передоплата</th>
            <th>Днів</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={
                row.id ??
                [
                  groupId,
                  row.documentNumber,
                  row.documentDate,
                  row.paymentDate,
                ].join(":")
              }
            >
              <td>{row.documentNumber || "-"}</td>
              <td>
                {row.form2 ? (
                  <i
                    className="fa-solid fa-check"
                    style={{ color: "#14C700" }}
                  ></i>
                ) : (
                  ""
                )}
              </td>
              <td>
                {row.fact ? (
                  <i
                    className="fa-solid fa-check"
                    style={{ color: "#14C700" }}
                  ></i>
                ) : (
                  ""
                )}
              </td>
              <td>{formatDate(row.documentDate) || "-"}</td>
              <td>{row.deferment || "0"}</td>
              <td>{formatDate(row.paymentDate) || "-"}</td>
              <td className={style.money}>{formatMoney(getDocumentAmount(row))}</td>
              <td className={style.money}>{formatMoney(row.prepayment)}</td>
              <td className={getOverdueClassName(row.overdueDays)}>
                {row.overdueDays || 0}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportDebet({ setLastUpdateTime }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(true);
  const [groupingMode, setGroupingMode] = useState(GROUPING_MODES.collector);
  const [openPrimaryGroups, setOpenPrimaryGroups] = useState({});
  const [openSecondaryGroups, setOpenSecondaryGroups] = useState({});

  useEffect(() => {
    let isActive = true;

    setLoading(true);
    setError("");

    fetchStaticReport("report-debet")
      .then((data) => {
        if (!isActive) return;
        setRows(Array.isArray(data) ? data : []);
        if (typeof setLastUpdateTime === "function") {
          setLastUpdateTime("");
        }
      })
      .catch((loadError) => {
        if (!isActive) return;
        console.error("Failed to load debet report:", loadError);
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

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return rows.filter((row) => {
      if (onlyOverdue && !(Number(row.overdueDays) > 0)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        row.collector,
        row.customer,
        row.pointOfSale,
        row.documentNumber,
        row.login,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [onlyOverdue, query, rows]);

  const groupedRows = useMemo(() => {
    if (groupingMode === GROUPING_MODES.contractor) {
      return buildContractorGroups(filteredRows);
    }

    return buildCollectorGroups(filteredRows);
  }, [filteredRows, groupingMode]);

  useEffect(() => {
    setOpenPrimaryGroups((current) => {
      const nextState = {};

      for (const group of groupedRows) {
        nextState[group.id] = current[group.id] ?? true;
      }

      return nextState;
    });

    setOpenSecondaryGroups((current) => {
      const nextState = {};

      for (const group of groupedRows) {
        for (const child of group.children) {
          nextState[child.id] = current[child.id] ?? false;
        }
      }

      return nextState;
    });
  }, [groupedRows]);

  const grandTotal = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (Number(row.debt) || 0), 0),
    [filteredRows],
  );

  const primaryCountLabel =
    groupingMode === GROUPING_MODES.contractor ? "ТА" : "Контрагентів";
  const groupingSubtitle =
    groupingMode === GROUPING_MODES.contractor
      ? "Контрагент → ТА → документи"
      : "ТА → контрагент → документи";

  return (
    <section className={style.report}>
      <div className={style.header}>
        <div>
          <h2 className={style.title}>Дебіторська заборгованість</h2>
          <p className={style.subtitle}>
            Позицій: <strong>{filteredRows.length}</strong>
          </p>
        </div>

        <div className={style.filters}>
          <div className={style.groupingField}>
            <span>Групування</span>
            <div className={style.segmentedControl}>
              <button
                type="button"
                className={
                  groupingMode === GROUPING_MODES.collector ? style.active : ""
                }
                onClick={() => setGroupingMode(GROUPING_MODES.collector)}
              >
                Колектор
              </button>
              <button
                type="button"
                className={
                  groupingMode === GROUPING_MODES.contractor
                    ? style.active
                    : ""
                }
                onClick={() => setGroupingMode(GROUPING_MODES.contractor)}
              >
                Контрагент
              </button>
            </div>
          </div>

          <label className={style.searchField}>
            <span>Пошук</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ТА, контрагент, ТТ, документ"
            />
          </label>

          <label className={style.checkboxField}>
            <input
              type="checkbox"
              checked={onlyOverdue}
              onChange={(event) => setOnlyOverdue(event.target.checked)}
            />
            <span>Тільки прострочений борг</span>
          </label>
        </div>
      </div>

      <div className={style.totalBar}>
        <span>{groupingSubtitle}</span>
        <strong>{formatMoney(grandTotal)}</strong>
      </div>

      {loading ? <DataLoader label="Завантаження дебіторської заборгованості…" /> : null}
      {!loading && error ? <p className={style.error}>{error}</p> : null}
      {!loading && !error && groupedRows.length === 0 ? (
        <p className={style.state}>Немає даних для відображення</p>
      ) : null}

      {!loading &&
        !error &&
        groupedRows.map((group) => (
          <div key={group.id} className={style.group}>
            <div
              className={style.groupHeader}
              onClick={() =>
                setOpenPrimaryGroups((current) => ({
                  ...current,
                  [group.id]: !current[group.id],
                }))
              }
            >
              <div>
                <h3>
                  <span className={style.groupMarker}>
                    {openPrimaryGroups[group.id] ? "▾" : "▸"}
                  </span>
                  {group.title}
                </h3>
                {group.address ? <p>Адреса: {group.address}</p> : null}
                {group.meta ? <p>Логін: {group.meta}</p> : null}
                <p>
                  {primaryCountLabel}: {group.children.length}
                </p>
              </div>
              <div className={style.groupTotals}>
                <span>Борг: {formatMoney(group.totalDebt)}</span>
                <span>Передоплата: {formatMoney(group.totalPrepayment)}</span>
              </div>
            </div>

            {openPrimaryGroups[group.id] ? (
              <div className={style.contractors}>
                {group.children.map((child) => (
                  <div key={child.id} className={style.contractorBlock}>
                    <div
                      className={style.contractorHeader}
                      onClick={() =>
                        setOpenSecondaryGroups((current) => ({
                          ...current,
                          [child.id]: !current[child.id],
                        }))
                      }
                    >
                      <div>
                        <strong>
                          <span className={style.groupMarker}>
                            {openSecondaryGroups[child.id] ? "▾" : "▸"}
                          </span>
                          {child.title}
                        </strong>
                        {child.address ? <p>Адреса: {child.address}</p> : null}
                        {child.meta ? <p>Логін: {child.meta}</p> : null}
                        <p>Документів: {child.rows.length}</p>
                      </div>
                      <div className={style.groupTotals}>
                        <span>Борг: {formatMoney(child.totalDebt)}</span>
                        <span>
                          Передоплата: {formatMoney(child.totalPrepayment)}
                        </span>
                      </div>
                    </div>

                    {openSecondaryGroups[child.id] ? (
                      <DocumentRows rows={child.rows} groupId={child.id} />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
    </section>
  );
}
