import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Filter } from "../Filter/Filter";
import { Table } from "../Table/Table";
import { loadData } from "../../Utils/dataLoader";

export const ParseExcel = ({ fileName, setLastUpdateTime }) => {
  const [parsedData, setParsedData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  // const [lastUpdateTime, setLastUpdateTime] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    const loadFile = async () => {
      try {
        const response = await fetch(`/src/Sorce/${fileName}`);
        if (!response.ok) {
          throw new Error("Failed to fetch the file");
        }
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get only the header row (first row in the range)
        const headData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
        const lastUpdateTime = headData[0][0].slice(11); // Assuming the first cell contains the update time
        setLastUpdateTime(lastUpdateTime); // Update the state



        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 11 });
        const hierarchy = buildHierarchy(rawData);
        setParsedData(hierarchy);
        setFilteredData(hierarchy); // Initially, the filtered data matches the parsed data
      } catch (error) {
        console.error("Error loading file:", error);
      }
    };

    // Initial data load
    loadFile();

    // Set up polling to refresh data every 5 minutes
    const intervalId = setInterval(loadFile, 60000); // 300,000 ms = 5 minutes

    // Clear interval on component unmount
    return () => clearInterval(intervalId);
  }, [fileName, setLastUpdateTime]);

  const level1 = ["ТОВАР"];
  const level2 = ["МРІЯ", "РОШЕН"];
  const level3 = [
    "ДЕСЕРТИ",
    "ДОБАВКИ",
    "ПРИПРАВИ",
    "СПЕЦІЇ",
    "БАТОНИ",
    "БІСКВІТИ",
    "ВАФЛІ ФАСОВАНІ",
    "КАРАМЕЛЬ 200/300",
    "КАРАМЕЛЬ ВАГОВА",
    "КОРОБКИ",
    "ПЕЧИВО ТА КРЕКЕР ФАСОВАНІ",
    "ЦУКЕРКИ ШОКОЛАДНІ ВАГОВІ",
    "ЦУКЕРКИ ШОКОЛАДНІ ФАСОВАНІ",
    "ШОКОЛАД",
  ];

  const buildHierarchy = (data) => {
    const result = [];
    let currentLevel1 = null;
    let currentLevel2 = null;
    let currentLevel3 = null;

    data.forEach((row) => {
      const [productName, ...productQuantity] = row;

      if (level1.includes(productName)) {
        currentLevel1 = {
          productNameCell: productName,
          productQuantityCell: productQuantity,
          level: "group1", // Добавляем поле level для level1
          children: []
        };
        result.push(currentLevel1);
        currentLevel2 = null;
        currentLevel3 = null;
      } else if (level2.includes(productName)) {
        currentLevel2 = {
          productNameCell: productName,
          productQuantityCell: productQuantity,
          level: "group2", // Добавляем поле level для level2
          children: []
        };
        currentLevel1.children.push(currentLevel2);
        currentLevel3 = null;
      } else if (level3.includes(productName)) {
        currentLevel3 = {
          productNameCell: productName,
          productQuantityCell: productQuantity,
          level: "group3", // Добавляем поле level для level3
          children: []
        };
        if (currentLevel2) {
          currentLevel2.children.push(currentLevel3);
        } else {
          currentLevel1.children.push(currentLevel3);
        }
      } else {
        const product = {
          productNameCell: productName,
          productQuantityCell: productQuantity
        };
        if (currentLevel3) {
          currentLevel3.children.push(product);
        } else if (currentLevel2) {
          currentLevel2.children.push(product);
        } else {
          currentLevel1.children.push(product);
        }
      }
    });

    return result;
  };

  const handleFilterChange = (selectedFilter) => {
    setKeyword(selectedFilter);

    // Объект для сопоставления значений фильтра с отображаемыми значениями
    const filterMap = {
      vip: "ВІП",
      opt: "ОПТ",
      all: "Весь товар"
    };

    // Получаем нормализованное значение из объекта filterMap
    const normalizedFilter = filterMap[selectedFilter] || selectedFilter;

    if (normalizedFilter === "Весь товар") {
      setFilteredData(parsedData); // если фильтр "all", сбрасываем фильтрацию
    } else {
      const filterHierarchy = (data) => {
        return data
          .map((item) => {
            // Если есть дочерние элементы, фильтруем их рекурсивно
            if (item.children) {
              const filteredChildren = filterHierarchy(item.children);
              // Если у категории есть отфильтрованные дочерние элементы, она сохраняется
              return filteredChildren.length > 0 ? { ...item, children: filteredChildren } : null;
            }

            // Фильтрация только по level
            if (item.level && item.level.includes(normalizedFilter)) {
              return item;
            }

            return null; // Если не найдено совпадений
          })
          .filter(Boolean); // Убираем null (пустые категории)
      };

      // Применяем фильтрацию и сохраняем результат
      setFilteredData(filterHierarchy(parsedData));
    }
  };



  return (
    <div>
      <Filter onFilterChange={handleFilterChange} />
      <hr />
      {filteredData.length > 0 ? (
        <Table data={filteredData} />
      ) : (
        <p>Нет данных для отображения</p>
      )}
    </div>
  );
};
