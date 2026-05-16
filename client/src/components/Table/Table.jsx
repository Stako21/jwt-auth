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

  useEffect(() => {
    setVisibility(buildVisibilityMap(data));
  }, [data]);

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
            <thead>
              <tr>
                <th className={style.productHeader}>Товар</th>
                <th className={style.quantityHeader}>Залишок</th>
              </tr>
            </thead>
            <tbody>
              {flatData.map((row) => {
                const isLeafRow = !row.hasChildren;
                const leafRowIndex = isLeafRow ? leafRowOrder[row.id] : -1;

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
                      style={{ paddingLeft: `${16 + row.level * 14}px` }}
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
                      <span className={style.productText}>{row.productNameCell}</span>
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
