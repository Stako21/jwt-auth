import React, { useEffect, useMemo, useState } from "react";
import cn from "classnames";
import style from "./Table.module.scss";
import ScrollToTopButton from "../ScrollToTopButton/ScrollToTopButton";

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

export const Table = ({ data }) => {
  const [visibility, setVisibility] = useState(() => buildVisibilityMap(data));
  const [activePriceRowId, setActivePriceRowId] = useState(null);

  useEffect(() => {
    setVisibility(buildVisibilityMap(data));
    setActivePriceRowId(null);
  }, [data]);

  useEffect(() => {
    if (!activePriceRowId) return undefined;

    const timeoutId = setTimeout(() => {
      setActivePriceRowId(null);
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [activePriceRowId]);

  const flatData = useMemo(() => flattenData(data), [data]);
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
          <table className={style.balanceTable}>
            {/* <thead>
              <tr>
                <th className={style.productHeader}>Товар</th>
                <th className={style.quantityHeader}>Залишок</th>
              </tr>
            </thead> */}
            <tbody>
              {flatData.map((row) => {
                const isLeafRow = !row.hasChildren;
                const leafRowIndex = isLeafRow ? leafRowOrder[row.id] : -1;
                const hasPrice = isLeafRow && typeof row.priceCell === "number";
                const displayPrice =
                  typeof row.adjustedPriceCell === "number"
                    ? row.adjustedPriceCell
                    : row.priceCell;

                if (!isRowVisible(row)) return null;

                return (
                  <tr
                    key={row.id}
                    className={cn(style[`level${row.level}`], {
                      [style.evenRow]: isLeafRow && leafRowIndex % 2 === 0,
                      [style.oddRow]: isLeafRow && leafRowIndex % 2 !== 0,
                    })}
                  >
                    <td
                      className={style.productCell}
                      style={{ paddingLeft: `${10 + row.level * 6}px` }}
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
                                ? "fa-regular fa-minus-square"
                                : "fa-regular fa-plus-square",
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
                        row.productQuantityCell.some((value) => value < 0) && style.negative,
                      )}
                    >
                      {row.productQuantityCell.join(", ")}
                    </td>
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
