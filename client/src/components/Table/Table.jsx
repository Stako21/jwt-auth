import React, { useEffect, useMemo, useState } from "react";
import cn from "classnames";
import style from "./Table.module.scss";
import ScrollToTopButton from "../ScrollToTopButton/ScrollToTopButton";
import { UI_TIMING } from "../../uiTokens";

function buildVisibilityMap(items, parentId = "", result = {}) {
  items.forEach((item, index) => {
    const itemId = `${parentId}-${index}`;
    if (item.children?.length) {
      result[itemId] = true;
      buildVisibilityMap(item.children, itemId, result);
    }
  });

  return result;
}

function flattenData(data, level = 0, parentId = "") {
  let flatData = [];

  data.forEach((item, index) => {
    const itemId = `${parentId}-${index}`;
    flatData.push({
      id: itemId,
      productNameCell: item.productNameCell,
      productQuantityCell: item.productQuantityCell,
      priceCell: item.priceCell,
      adjustedPriceCell: item.adjustedPriceCell,
      configuredValues: item.configuredValues,
      priceMultiplierPercent: item.priceMultiplierPercent,
      level,
      parentId,
      hasChildren: !!(item.children && item.children.length > 0),
    });

    if (item.children?.length) {
      flatData = flatData.concat(flattenData(item.children, level + 1, itemId));
    }
  });

  return flatData;
}

function formatConfiguredValue(value, isPrice) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: isPrice ? 2 : 0,
    maximumFractionDigits: isPrice ? 2 : 3,
  }).format(value);
}

function useMobileTableLayout() {
  const query = "(max-width: 768px)";
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setIsMobile(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

function prioritizeMobileColumns(columns) {
  if (!columns?.length) return columns;
  const hierarchyColumn = columns.find((column) => column.role === "hierarchy");
  const balanceColumn = columns.find((column) =>
    column.role !== "hierarchy" &&
    /остат|залиш|свобод/i.test(`${column.sourceHeader || ""} ${column.title || ""}`));
  const primaryMetric = balanceColumn || columns.find((column) => column.role !== "hierarchy");
  const primaryIds = new Set([hierarchyColumn?.id, primaryMetric?.id].filter(Boolean));
  return [hierarchyColumn, primaryMetric, ...columns.filter((column) => !primaryIds.has(column.id))]
    .filter(Boolean);
}

function getMobileExtraColumnWidth(column, rows) {
  const lengths = [column.title, ...rows.map((row) => row.configuredValues?.[column.id])]
    .map((value) => Array.from(String(value ?? "")).length);
  const longestValue = Math.min(28, Math.max(...lengths));
  return Math.min(220, Math.max(112, Math.ceil(longestValue * 7.2 + 28)));
}

export const Table = ({ data, columns = null }) => {
  const [visibility, setVisibility] = useState(() => buildVisibilityMap(data));
  const [activePriceRowId, setActivePriceRowId] = useState(null);
  const isMobileLayout = useMobileTableLayout();

  useEffect(() => {
    setVisibility(buildVisibilityMap(data));
    setActivePriceRowId(null);
  }, [data]);

  useEffect(() => {
    if (!activePriceRowId) return undefined;

    const timeoutId = setTimeout(() => {
      setActivePriceRowId(null);
    }, UI_TIMING.pricePopoverTimeoutMs);

    return () => clearTimeout(timeoutId);
  }, [activePriceRowId]);

  const flatData = useMemo(() => flattenData(data), [data]);
  const visibleColumns = useMemo(
    () => columns?.filter((column) => !column.isPrice) || null,
    [columns],
  );
  const displayColumns = useMemo(
    () => isMobileLayout ? prioritizeMobileColumns(visibleColumns) : visibleColumns,
    [isMobileLayout, visibleColumns],
  );
  const mobileExtraWidths = useMemo(() => {
    if (!isMobileLayout || !displayColumns?.length) return {};
    return Object.fromEntries(displayColumns.slice(2).map((column) => [
      column.id,
      getMobileExtraColumnWidth(column, flatData),
    ]));
  }, [displayColumns, flatData, isMobileLayout]);
  const mobileTableStyle = useMemo(() => {
    if (!isMobileLayout || !displayColumns?.length) return undefined;
    const extraWidth = Object.values(mobileExtraWidths)
      .reduce((total, width) => total + width, 0);
    return { width: `calc(100vw + ${extraWidth}px)` };
  }, [displayColumns, isMobileLayout, mobileExtraWidths]);
  const rowMap = useMemo(
    () => Object.fromEntries(flatData.map((row) => [row.id, row])),
    [flatData],
  );

  const toggleVisibility = (id) => {
    setVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isRowVisible = (row) => {
    if (!row.parentId) return true;

    let parentId = row.parentId;
    while (parentId) {
      if (visibility[parentId] === false) return false;
      parentId = rowMap[parentId]?.parentId || "";
    }

    return true;
  };

  const formatPrice = (value) =>
    new Intl.NumberFormat("uk-UA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const leafRowOrder = useMemo(() => {
    const result = {};
    let index = 0;

    flatData.forEach((row) => {
      if (!row.hasChildren) {
        result[row.id] = index;
        index += 1;
      }
    });

    return result;
  }, [flatData]);

  return (
    <div className={style.wraperTable}>
      <div className={style.tableShell}>
        <div className={style.scrollContainer}>
          <table
            className={cn(style.balanceTable, displayColumns?.length && style.configuredTable)}
            style={mobileTableStyle}
          >
            {displayColumns?.length ? (
              <colgroup>
                {displayColumns.map((column, index) => (
                  <col
                    key={column.id}
                    className={cn({
                      [style.primaryProductColumn]: index === 0,
                      [style.primaryMetricColumn]: index === 1,
                      [style.extraConfiguredColumn]: index > 1,
                    })}
                    style={index > 1 ? { width: mobileExtraWidths[column.id] } : undefined}
                  />
                ))}
              </colgroup>
            ) : null}
            <thead>
              <tr>
                {displayColumns?.length ? displayColumns.map((column, index) => (
                  <th
                    key={column.id}
                    className={cn(
                      column.role === "hierarchy" ? style.productHeader : style.metricHeader,
                      index > 1 && style.extraConfiguredCell,
                    )}
                  >
                    {column.title}
                  </th>
                )) : <>
                  <th className={style.productHeader}>Номенклатура</th>
                  <th className={style.quantityHeader}>Залишок</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {flatData.map((row) => {
                const isLeafRow = !row.hasChildren;
                const leafRowIndex = isLeafRow ? leafRowOrder[row.id] : -1;
                const hasPrice = isLeafRow && typeof row.priceCell === "number";
                const displayPrice =
                  typeof row.adjustedPriceCell === "number"
                    ? row.adjustedPriceCell
                    : row.priceCell;
                const hasNegativeQuantity = row.productQuantityCell.some(
                  (value) => Number(value) < 0,
                );

                if (!isRowVisible(row)) return null;

                return (
                  <tr
                    key={row.id}
                    className={cn(style[`level${Math.min(row.level, 3)}`], {
                      [style.leafRow]: isLeafRow,
                      [style.evenRow]: isLeafRow && leafRowIndex % 2 === 0,
                      [style.oddRow]: isLeafRow && leafRowIndex % 2 !== 0,
                    })}
                  >
                    {displayColumns?.length ? displayColumns.map((column, index) => column.role === "hierarchy" ? (
                      <td
                        key={column.id}
                        className={cn(style.productCell, index > 1 && style.extraConfiguredCell)}
                        style={{ "--row-level": row.level }}
                      >
                        {row.hasChildren && (
                          <button
                            onClick={() => toggleVisibility(row.id)}
                            className={style.toggleButton}
                            type="button"
                            aria-label={visibility[row.id] ? "Згорнути групу товарів" : "Розгорнути групу товарів"}
                          >
                            <i className={cn(style.toggleIcon, visibility[row.id]
                              ? "fa-solid fa-chevron-down"
                              : "fa-solid fa-chevron-right")} />
                          </button>
                        )}
                        <span
                          className={cn(style.productText, {
                            [style.productTextWithPrice]: hasPrice,
                          })}
                          onClick={hasPrice ? () => setActivePriceRowId((currentId) =>
                            currentId === row.id ? null : row.id) : undefined}
                          role={hasPrice ? "button" : undefined}
                          tabIndex={hasPrice ? 0 : undefined}
                          onKeyDown={hasPrice ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActivePriceRowId((currentId) =>
                                currentId === row.id ? null : row.id);
                            }
                          } : undefined}
                        >
                          {row.productNameCell}
                        </span>
                        {hasPrice && activePriceRowId === row.id && (
                          <div className={style.pricePopover}>
                            <div className={style.priceLine}>
                              <span>Ціна</span>
                              <strong>{formatPrice(displayPrice)}</strong>
                            </div>
                          </div>
                        )}
                      </td>
                    ) : (
                      <td
                        key={column.id}
                        className={cn(
                          style.metricCell,
                          index > 1 && style.extraConfiguredCell,
                          typeof row.configuredValues?.[column.id] !== "number" && style.textMetricCell,
                          Number(row.configuredValues?.[column.id]) < 0 && style.negative,
                        )}
                      >
                        {formatConfiguredValue(
                          row.configuredValues?.[column.id],
                          column.isPrice,
                        )}
                      </td>
                    )) : <><td
                      className={style.productCell}
                      style={{ "--row-level": row.level }}
                    >
                      {row.hasChildren && (
                        <button
                          onClick={() => toggleVisibility(row.id)}
                          className={style.toggleButton}
                          type="button"
                          aria-label={
                            visibility[row.id]
                              ? "Згорнути групу товарів"
                              : "Розгорнути групу товарів"
                          }
                        >
                          <i
                            className={cn(
                              style.toggleIcon,
                              visibility[row.id]
                                ? "fa-solid fa-chevron-down"
                                : "fa-solid fa-chevron-right",
                            )}
                          ></i>
                        </button>
                      )}
                      <span
                        className={cn(style.productText, {
                          [style.productTextWithPrice]: hasPrice,
                        })}
                        onClick={
                          hasPrice
                            ? () =>
                                setActivePriceRowId((currentId) =>
                                  currentId === row.id ? null : row.id,
                                )
                            : undefined
                        }
                        role={hasPrice ? "button" : undefined}
                        tabIndex={hasPrice ? 0 : undefined}
                        onKeyDown={
                          hasPrice
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setActivePriceRowId((currentId) =>
                                    currentId === row.id ? null : row.id,
                                  );
                                }
                              }
                            : undefined
                        }
                      >
                        {row.productNameCell}
                      </span>
                      {hasPrice && activePriceRowId === row.id && (
                        <div className={style.pricePopover}>
                          <div className={style.priceLine}>
                            <span>Ціна</span>
                            <strong>{formatPrice(displayPrice)}</strong>
                          </div>
                        </div>
                      )}
                    </td>
                    <td
                      className={cn(
                        style.quantityCell,
                        hasNegativeQuantity && style.negative,
                      )}
                    >
                      {row.productQuantityCell.join(", ")}
                    </td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ScrollToTopButton />
    </div>
  );
};
