import React, { useState } from "react";
import cn from "classnames";
import style from "./Table.module.scss";

export const Table = ({ data }) => {
  const [visibility, setVisibility] = useState({});

  const toggleVisibility = (id) => {
    setVisibility((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const flattenData = (data, level = 0, parentId = "") => {
    let flatData = [];
    data.forEach((item, index) => {
      const itemId = `${parentId}-${index}`;
      const isVisible = visibility[itemId] ?? true;

      flatData.push({
        id: itemId,
        productNameCell: item.productNameCell,
        productQuantityCell: item.productQuantityCell,
        level,
        isVisible,
        hasChildren: !!(item.children && item.children.length > 0),
      });

      if (isVisible && item.children && item.children.length > 0) {
        flatData = flatData.concat(flattenData(item.children, level + 1, itemId));
      }
    });

    return flatData;
  };

  const flatData = flattenData(data);

  // Предварительно определяем массив всех level3 строк
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
              // Проверяем, является ли строка уровня 3
              const isLevel3 = row.level === 3;

              // Определяем индекс строки среди level3
              const level3Index = isLevel3
                ? level3Rows.findIndex((item) => item.id === row.id)
                : -1;

              return (
                <tr
                  key={row.id}
                  className={cn(
                    style[`level${row.level}`], // Добавляем класс уровня
                    {
                      [style.evenRow]: isLevel3 && level3Index % 2 === 0, // Класс для чётных строк level3
                      [style.oddRow]: isLevel3 && level3Index % 2 !== 0, // Класс для нечётных строк level3
                    }
                  )}
                >
                  <td
                    className={cn(style.productCell)}
                    style={{ paddingLeft: `${row.level * 5}px` }} // Увеличил отступ для лучшей видимости
                  >
                    {row.hasChildren && (
                      <button
                        onClick={() => toggleVisibility(row.id)}
                        className={style.toggleButton}
                      >
                        {row.isVisible ? "-" : "+"}
                      </button>
                    )}
                    {row.productNameCell}
                  </td>
                  <td
                    className={cn(
                      style.quantityCell,
                      row.productQuantityCell.some((value) => value < 0) && style.negative
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
