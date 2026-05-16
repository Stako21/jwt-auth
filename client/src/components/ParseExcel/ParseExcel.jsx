import React, { useState, useEffect, useCallback } from "react";
import { Filter } from "../Filter/Filter";
import { Table } from "../Table/Table";
import { fetchBalanceFile } from "../../services/balances.api";
import { parseBalanceWorkbookData } from "../../utils/balanceWorkbookParser";
import style from "./ParseExcel.module.scss";

function matchesProductFilter(productName, selectedFilter) {
  if (selectedFilter === "all") {
    return true;
  }

  if (selectedFilter === "vip") {
    return productName.includes("ВІП");
  }

  if (selectedFilter === "opt") {
    return productName.includes("ОПТ");
  }

  return true;
}

function filterHierarchy(items, selectedFilter, searchQuery, forceIncludeByParent = false) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  return items
    .map((item) => {
      const name = String(item.productNameCell || "");
      const normalizedName = name.toLocaleLowerCase();
      const matchesSearch = !normalizedQuery || normalizedName.includes(normalizedQuery);
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;

      if (hasChildren) {
        const filteredChildren = filterHierarchy(
          item.children,
          selectedFilter,
          searchQuery,
          forceIncludeByParent || matchesSearch,
        );

        if (!filteredChildren.length) {
          return null;
        }

        return {
          ...item,
          children: filteredChildren,
        };
      }

      const allowedByFilter = matchesProductFilter(name, selectedFilter);
      const allowedBySearch = forceIncludeByParent || !normalizedQuery || matchesSearch;

      return allowedByFilter && allowedBySearch ? item : null;
    })
    .filter(Boolean);
}

function countLeafRows(items) {
  return items.reduce((total, item) => {
    if (item.children?.length) {
      return total + countLeafRows(item.children);
    }

    return total + 1;
  }, 0);
}

export const ParseExcel = ({ fileName, balanceSlug, setLastUpdateTime }) => {
  const [parsedData, setParsedData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
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
    const intervalId = setInterval(loadFile, 300000);
    return () => clearInterval(intervalId);
  }, [loadFile]);

  useEffect(() => {
    setSelectedFilter("all");
    setSearchQuery("");
  }, [balanceSlug, fileName]);

  useEffect(() => {
    setFilteredData(filterHierarchy(parsedData, selectedFilter, searchQuery));
  }, [parsedData, searchQuery, selectedFilter]);

  const totalRows = countLeafRows(parsedData);
  const visibleRows = countLeafRows(filteredData);

  return (
    <div className={style.pageSection}>
      <Filter
        searchQuery={searchQuery}
        selectedFilter={selectedFilter}
        onSearchChange={setSearchQuery}
        onFilterChange={setSelectedFilter}
        totalCount={totalRows}
        visibleCount={visibleRows}
      />

      {!isRendered ? (
        <div className={style.stateCard}>
          <p className={style.stateText}>Завантаження залишків...</p>
        </div>
      ) : errorMessage ? (
        <div className={`${style.stateCard} ${style.errorState}`}>
          <p className={style.stateText}>{errorMessage}</p>
        </div>
      ) : filteredData.length > 0 ? (
        <Table data={filteredData} />
      ) : (
        <div className={style.stateCard}>
          <p className={style.stateText}>Нічого не знайдено за поточним пошуком або фільтром</p>
        </div>
      )}
    </div>
  );
};
