import React, { useState } from "react";
import cn from "classnames";
import style from "./Table.module.scss";

export const Table = ({ data }) => {
  // Инициализируем состояние с видимыми элементами
  const [visibility, setVisibility] = useState(() => {
    const initialVisibility = {};

    const initializeVisibility = (items, parentId = "") => {
      items.forEach((item, index) => {
        const itemId = `${parentId}-${index}`;
        if (item.children && item.children.length > 0) {
          initialVisibility[itemId] = true; // По умолчанию видим
          initializeVisibility(item.children, itemId);
        }
      });
    };

    initializeVisibility(data);
    return initialVisibility;
  });

  const toggleVisibility = (id) => {
    setVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // flatData строим без проверки видимости
  const flattenData = (data, level = 0, parentId = "") => {
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

      if (item.children && item.children.length > 0) {
        flatData = flatData.concat(
          flattenData(item.children, level + 1, itemId)
        );
      }
    });

    return flatData;
  };

  const flatData = flattenData(data);

  // Функция для проверки видимости строки по всем родителям
  const isRowVisible = (row) => {
    if (!row.parentId) return true;

    let parentId = row.parentId;
    while (parentId) {
      // Используем текущее состояние visibility
      if (visibility[parentId] === false) return false;

      // Получаем следующий parentId
      const parentRow = flatData.find((r) => r.id === parentId);
      parentId = parentRow ? parentRow.parentId : "";
    }
    return true;
  };

  const level3Rows = flatData.filter((row) => row.level === 3);

  return (
    <div className={style.wraperTable}>
      <div className={style.scrollContainer}>
        <table className={style.table}>
          <thead>
            <tr>
              <th className={style.productCell}></th>
              <th className={style.quantityCell}></th>
            </tr>
          </thead>
          <tbody>
            {flatData.map((row) => {
              const isLevel3 = row.level === 3;
              const level3Index = isLevel3
                ? level3Rows.findIndex((item) => item.id === row.id)
                : -1;

              // Проверяем видимость по всем родителям
              if (!isRowVisible(row)) return null;

              return (
                <tr
                  key={row.id}
                  className={cn(style[`level${row.level}`], {
                    [style.evenRow]: isLevel3 && level3Index % 2 === 0,
                    [style.oddRow]: isLevel3 && level3Index % 2 !== 0,
                  })}
                >
                  <td
                    className={cn(style.productCell)}
                    style={{ paddingLeft: `${row.level * 5}px` }}
                  >
                    {row.hasChildren && (
                      <button
                        onClick={() => toggleVisibility(row.id)}
                        className={style.toggleButton}
                      >
                        <i
                          className={cn(
                            style.toggleIcon,
                            visibility[row.id]
                              ? "fa-regular fa-minus-square fa-lg"
                              : "fa-regular fa-plus-square fa-lg"
                          )}
                        ></i>
                        {/* {visibility[row.id] ? "-" : "+"} */}
                      </button>
                    )}
                    {row.productNameCell}
                  </td>
                  <td
                    className={cn(
                      style.quantityCell,
                      row.productQuantityCell.some((value) => value < 0) &&
                        style.negative
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
  );
};
