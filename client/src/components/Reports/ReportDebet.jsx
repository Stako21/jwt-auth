import { useEffect, useMemo, useState } from "react";
import style from "./ReportDebet.module.scss";
import { fetchStaticReport } from "../../services/reports.api";

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

function getContractorLabel(row) {
  const customer = String(row.customer || "").trim();
  const pointOfSale = String(row.pointOfSale || "").trim();

  if (customer && pointOfSale) {
    return `${customer} — ${pointOfSale}`;
  }

  return customer || pointOfSale || "Без контрагента";
}

export function ReportDebet({ setLastUpdateTime }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(true);
  const [openTaGroups, setOpenTaGroups] = useState({});
  const [openContractorGroups, setOpenContractorGroups] = useState({});

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
          loadError?.response?.data?.message || "Не вдалося завантажити звіт",
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
    const taGroups = new Map();

    for (const row of filteredRows) {
      const taName = row.collector || row.login || "Без ТА";
      const taLogin = row.login || "";
      const taId = `${taName}:${taLogin}`;

      if (!taGroups.has(taId)) {
        taGroups.set(taId, {
          id: taId,
          displayName: taName,
          login: taLogin,
          totalDebt: 0,
          totalPrepayment: 0,
          contractors: new Map(),
        });
      }

      const taGroup = taGroups.get(taId);
      taGroup.totalDebt += Number(row.debt) || 0;
      taGroup.totalPrepayment += Number(row.prepayment) || 0;

      const contractorLabel = getContractorLabel(row);
      const contractorId = `${taId}:${contractorLabel}`;

      if (!taGroup.contractors.has(contractorId)) {
        taGroup.contractors.set(contractorId, {
          id: contractorId,
          label: contractorLabel,
          totalDebt: 0,
          totalPrepayment: 0,
          rows: [],
        });
      }

      const contractorGroup = taGroup.contractors.get(contractorId);
      contractorGroup.totalDebt += Number(row.debt) || 0;
      contractorGroup.totalPrepayment += Number(row.prepayment) || 0;
      contractorGroup.rows.push(row);
    }

    return Array.from(taGroups.values())
      .map((taGroup) => ({
        ...taGroup,
        contractors: Array.from(taGroup.contractors.values())
          .map((contractor) => ({
            ...contractor,
            rows: [...contractor.rows].sort((left, right) => {
              return String(left.documentNumber || "").localeCompare(
                String(right.documentNumber || ""),
                "uk-UA",
              );
            }),
          }))
          .sort((left, right) => left.label.localeCompare(right.label, "uk-UA")),
      }))
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, "uk-UA"),
      );
  }, [filteredRows]);

  useEffect(() => {
    setOpenTaGroups((current) => {
      const nextState = {};

      for (const group of groupedRows) {
        nextState[group.id] = current[group.id] ?? true;
      }

      return nextState;
    });

    setOpenContractorGroups((current) => {
      const nextState = {};

      for (const group of groupedRows) {
        for (const contractor of group.contractors) {
          nextState[contractor.id] = current[contractor.id] ?? false;
        }
      }

      return nextState;
    });
  }, [groupedRows]);

  const grandTotal = useMemo(
    () =>
      filteredRows.reduce((sum, row) => sum + (Number(row.debt) || 0), 0),
    [filteredRows],
  );

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
        <span>Загальний борг</span>
        <strong>{formatMoney(grandTotal)}</strong>
      </div>

      {loading ? <p className={style.state}>Завантаження...</p> : null}
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
                setOpenTaGroups((current) => ({
                  ...current,
                  [group.id]: !current[group.id],
                }))
              }
            >
              <div>
                <h3>
                  <span className={style.groupMarker}>
                    {openTaGroups[group.id] ? "▾" : "▸"}
                  </span>
                  {group.displayName}
                </h3>
                {group.login ? <p>Логін: {group.login}</p> : null}
                <p>Контрагентів: {group.contractors.length}</p>
              </div>
              <div className={style.groupTotals}>
                <span>Борг: {formatMoney(group.totalDebt)}</span>
                <span>Передоплата: {formatMoney(group.totalPrepayment)}</span>
              </div>
            </div>

            {openTaGroups[group.id] ? (
              <div className={style.contractors}>
                {group.contractors.map((contractor) => (
                  <div key={contractor.id} className={style.contractorBlock}>
                    <div
                      className={style.contractorHeader}
                      onClick={() =>
                        setOpenContractorGroups((current) => ({
                          ...current,
                          [contractor.id]: !current[contractor.id],
                        }))
                      }
                    >
                      <div>
                        <strong>
                          <span className={style.groupMarker}>
                            {openContractorGroups[contractor.id] ? "▾" : "▸"}
                          </span>
                          {contractor.label}
                        </strong>
                        <p>Документів: {contractor.rows.length}</p>
                      </div>
                      <div className={style.groupTotals}>
                        <span>Борг: {formatMoney(contractor.totalDebt)}</span>
                        <span>
                          Передоплата: {formatMoney(contractor.totalPrepayment)}
                        </span>
                      </div>
                    </div>

                    {openContractorGroups[contractor.id] ? (
                      <div className={style.tableShell}>
                        <table className={style.table}>
                          <thead>
                            <tr>
                              <th>Номер док.</th>
                              <th>Дата док.</th>
                              <th>Дата оплати</th>
                              <th>Сума док.</th>
                              <th>Передоплата</th>
                              <th>Днів</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contractor.rows.map((row) => (
                              <tr
                                key={
                                  row.id ??
                                  [
                                    contractor.id,
                                    row.documentNumber,
                                    row.documentDate,
                                    row.paymentDate,
                                  ].join(":")
                                }
                              >
                                <td>{row.documentNumber || "—"}</td>
                                <td>{formatDate(row.documentDate) || "—"}</td>
                                <td>{formatDate(row.paymentDate) || "—"}</td>
                                <td className={style.money}>
                                  {formatMoney(getDocumentAmount(row))}
                                </td>
                                <td className={style.money}>
                                  {formatMoney(row.prepayment)}
                                </td>
                                <td className={getOverdueClassName(row.overdueDays)}>
                                  {row.overdueDays || 0}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
