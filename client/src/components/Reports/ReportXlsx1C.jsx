import { useEffect, useMemo, useState } from "react";
import { fetchStaticReport } from "../../services/reports.api";
import style from "./ReportXlsx1C.module.scss";

function isNumericLike(value) {
  return /^-?\d+(?:[.,]\d+)?$/.test(String(value || "").replace(/\s/g, ""));
}

function getRowClassName(row) {
  const level = Math.min(Number(row.outlineLevel || 0), 6);
  return `${style.dataRow} ${style[`level${level}`] || ""}`;
}

export function ReportXlsx1C({ report, setLastUpdateTime }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError("");

    fetchStaticReport(report.reportKey)
      .then((data) => {
        if (ignore) return;
        setReportData(data);
        setLastUpdateTime?.(new Date().toLocaleTimeString("uk-UA", {
          hour: "2-digit",
          minute: "2-digit",
        }));
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.response?.data?.message || "Не вдалося завантажити звіт");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [report.reportKey, setLastUpdateTime]);

  const columns = reportData?.columns || [];
  const headerRows = reportData?.headerRows || [];
  const rows = reportData?.rows || [];
  const title = reportData?.meta?.title || report.menuTitle;

  const visibleColumns = useMemo(() => {
    return columns.map((column, index) => ({
      ...column,
      displayIndex: index,
    }));
  }, [columns]);

  if (loading) {
    return <div className={style.state}>Завантаження звіту...</div>;
  }

  if (error) {
    return <div className={`${style.state} ${style.error}`}>{error}</div>;
  }

  return (
    <section className={style.wrapper}>
      <header className={style.header}>
        <div>
          <h2>{title}</h2>
          <p>
            {reportData?.meta?.fileName}
            {reportData?.meta?.sheetName ? ` · ${reportData.meta.sheetName}` : ""}
          </p>
        </div>
        <span className={style.count}>Рядків: {rows.length}</span>
      </header>

      <div className={style.tableShell}>
        <table className={style.table}>
          <thead>
            {(headerRows.length
              ? headerRows
              : [
                  {
                    rowNumber: "fallback",
                    cells: visibleColumns.map((column) => column.label),
                  },
                ]
            ).map((headerRow) => (
              <tr key={headerRow.rowNumber}>
                {visibleColumns.map((column) => (
                  <th key={`${headerRow.rowNumber}-${column.key}`}>
                    {headerRow.cells[column.displayIndex] || ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={getRowClassName(row)}
                key={row.rowNumber}
                style={{ "--outline-level": row.outlineLevel || 0 }}
              >
                {visibleColumns.map((column) => {
                  const value = row.cells[column.displayIndex] || "";
                  const isFirstColumn = column.displayIndex === 0;
                  return (
                    <td
                      className={[
                        isNumericLike(value) ? style.numericCell : "",
                        isFirstColumn ? style.nameCell : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={column.key}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={Math.max(visibleColumns.length, 1)}>
                  У звіті немає рядків для відображення
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
