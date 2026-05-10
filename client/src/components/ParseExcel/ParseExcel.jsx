import React, { useState, useEffect, useCallback } from "react";
import { Filter } from "../Filter/Filter";
import { Table } from "../Table/Table";
import { fetchBalanceFile } from "../../services/balances.api";
import { parseBalanceWorkbookData } from "../../utils/balanceWorkbookParser";

export const ParseExcel = ({ fileName, balanceSlug, setLastUpdateTime }) => {
  const [parsedData, setParsedData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [isRendered, setIsRendered] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

      const { hierarchy, lastUpdateTime } = parseBalanceWorkbookData(data);
      setLastUpdateTime(lastUpdateTime);
      setParsedData(hierarchy);
      setFilteredData(hierarchy);
    } catch (error) {
      console.error("Error loading file:", error);
      const status = error.response?.status;
      const fileNotFoundMessage = error.response?.data?.message;
      setErrorMessage(
        status === 404
          ? fileNotFoundMessage || "Р¤Р°Р№Р» Р·Р°Р»РёС€РєС–РІ РЅРµ Р·РЅР°Р№РґРµРЅРѕ"
          : "РџРѕРјРёР»РєР° Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ С„Р°Р№Р»Сѓ Р·Р°Р»РёС€РєС–РІ",
      );
      setParsedData([]);
      setFilteredData([]);
    } finally {
      setIsRendered(true);
    }
  }, [balanceSlug, fileName, setLastUpdateTime]);

  useEffect(() => {
    loadFile();
    const intervalId = setInterval(loadFile, 300000);
    return () => clearInterval(intervalId);
  }, [loadFile]);

  useEffect(() => {
    if (parsedData.length > 0) {
      setIsRendered(true);
    }
  }, [parsedData]);

  const handleFilterChange = (selectedFilter) => {
    if (selectedFilter === "all") {
      setFilteredData(parsedData);
      return;
    }

    const filterHierarchy = (data) => {
      return data
        .map((item) => {
          if (item.children?.length) {
            const filteredChildren = filterHierarchy(item.children);
            return filteredChildren.length
              ? { ...item, children: filteredChildren }
              : null;
          }

          const matchesFilter =
            selectedFilter === "vip"
              ? item.productNameCell.includes("Р’Р†Рџ")
              : item.productNameCell.includes("РћРџРў");
          return matchesFilter ? item : null;
        })
        .filter(Boolean);
    };

    setFilteredData(filterHierarchy(parsedData));
  };

  return (
    <div>
      <Filter onFilterChange={handleFilterChange} />

      {!isRendered ? (
        <p>Р—Р°РіСЂСѓР·РєР°...</p>
      ) : errorMessage ? (
        <p>{errorMessage}</p>
      ) : filteredData.length > 0 ? (
        <Table data={filteredData} />
      ) : (
        <p>РќРµС‚ РґР°РЅРЅС‹С… РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ</p>
      )}
    </div>
  );
};
