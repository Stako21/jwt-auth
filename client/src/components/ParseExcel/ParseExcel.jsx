import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { Filter } from "../Filter/Filter";
import { Table } from "../Table/Table";
import { fetchBalanceFile } from "../../services/balances.api";

export const ParseExcel = ({ fileName, balanceSlug, setLastUpdateTime }) => {
  const [parsedData, setParsedData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [keyword, setKeyword] = useState("all");
  const [isRendered, setIsRendered] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const level1 = ["ТОВАР"];
  const level2 = ["МРІЯ", "РОШЕН"];
  const level3 = [
    "ДЕСЕРТИ", "ДОБАВКИ", "ПРИПРАВИ", "СПЕЦІЇ", "БАТОНИ", "БІСКВІТИ",
    "ВАФЛІ ФАСОВАНІ", "КАРАМЕЛЬ 200/300", "КАРАМЕЛЬ ВАГОВА", "КОРОБКИ",
    "ПЕЧИВО ТА КРЕКЕР ФАСОВАНІ", "ЦУКЕРКИ ШОКОЛАДНІ ВАГОВІ",
    "ЦУКЕРКИ ШОКОЛАДНІ ФАСОВАНІ", "ШОКОЛАД"
  ];

  const buildHierarchy = (data) => {
    const result = [];
    let currentLevel1 = null;
    let currentLevel2 = null;
    let currentLevel3 = null;

    data.forEach(([productName, ...productQuantity]) => {
      if (level1.includes(productName)) {
        currentLevel1 = { productNameCell: productName, productQuantityCell: productQuantity, level: "group1", children: [] };
        result.push(currentLevel1);
        currentLevel2 = null;
        currentLevel3 = null;
      } else if (level2.includes(productName)) {
        currentLevel2 = { productNameCell: productName, productQuantityCell: productQuantity, level: "group2", children: [] };
        currentLevel1?.children.push(currentLevel2);
        currentLevel3 = null;
      } else if (level3.includes(productName)) {
        currentLevel3 = { productNameCell: productName, productQuantityCell: productQuantity, level: "group3", children: [] };
        currentLevel2?.children.push(currentLevel3) ?? currentLevel1?.children.push(currentLevel3);
      } else {
        const product = { productNameCell: productName, productQuantityCell: productQuantity };
        currentLevel3?.children.push(product) ?? currentLevel2?.children.push(product) ?? currentLevel1?.children.push(product);
      }
    });
    return result;
  };

  const loadFile = useCallback(async () => {
    try {
      setErrorMessage("");
      setIsRendered(false);

      let data;
      if (balanceSlug) {
        data = await fetchBalanceFile(balanceSlug);
      } else {
        const response = await fetch(`/Sorce/${fileName}`);
        if (!response.ok) throw new Error("Failed to fetch the file");
        data = await response.arrayBuffer();
      }

      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const headData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1 });
      const lastUpdateTime = headData?.[0]?.[0]?.slice(11) || "";
      setLastUpdateTime(lastUpdateTime);

      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 11 });
      const hierarchy = buildHierarchy(rawData);

      setParsedData(hierarchy);
      setFilteredData(hierarchy);
    } catch (error) {
      console.error("Error loading file:", error);
      const status = error.response?.status;
      const fileNotFoundMessage = error.response?.data?.message;
      setErrorMessage(
        status === 404
          ? fileNotFoundMessage || "Файл залишків не знайдено"
          : "Помилка завантаження файлу залишків",
      );
      setParsedData([]);
      setFilteredData([]);
    } finally {
      setIsRendered(true);
    }
  }, [balanceSlug, fileName, setLastUpdateTime]);

  useEffect(() => {
    loadFile();
    const intervalId = setInterval(loadFile, 300000); // Обновление каждые 5 минут
    return () => clearInterval(intervalId);
  }, [loadFile]);

  useEffect(() => {
  }, [parsedData]);

  useEffect(() => {
    if (parsedData.length > 0) {
      setIsRendered(true);
    }
  }, [parsedData]);

  // Filtering function starts here
  const handleFilterChange = (selectedFilter) => {
    setKeyword(selectedFilter);
    if (selectedFilter === "all") {
      setFilteredData(parsedData);
      return;
    }

    const filterHierarchy = (data) => {
      return data.map((item) => {
        if (item.children) {
          const filteredChildren = filterHierarchy(item.children);
          return filteredChildren.length ? { ...item, children: filteredChildren } : null;
        }
        
        const matchesFilter = selectedFilter === "vip" ? item.productNameCell.includes("ВІП") : item.productNameCell.includes("ОПТ");
        return matchesFilter ? item : null;
      }).filter(Boolean);
    };

    const filtered = filterHierarchy(parsedData);
    setFilteredData(filtered);
  };

  useEffect(() => {
  }, [filteredData]);

  useEffect(() => {
  }, [keyword]);

  return (
    <div>
      <Filter onFilterChange={handleFilterChange} />
      
      {!isRendered ? (
        <p>Загрузка...</p>
      ) : errorMessage ? (
        <p>{errorMessage}</p>
      ) : filteredData.length > 0 ? (
        <Table data={filteredData} />
      ) : (
        <p>Нет данных для отображения</p>
      )}
    </div>
  );
};
