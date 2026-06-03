import path from "path";
import XLSX from "xlsx";
import { NotFound } from "../utils/Errors.js";
import { getImportDir } from "./appConfig.service.js";

function cleanCellValue(value) {
  if (value === null || value === undefined) return "";

  const text = String(value).trim();
  if (!text || text.toLowerCase() === "undefined") return "";

  return text;
}

function excelColumnName(index) {
  let value = index + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function getSheet(workbook, sheetName) {
  if (sheetName && workbook.Sheets[sheetName]) {
    return {
      name: sheetName,
      sheet: workbook.Sheets[sheetName],
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  return {
    name: firstSheetName,
    sheet: workbook.Sheets[firstSheetName],
  };
}

function rowHasData(row) {
  return row.some((value) => cleanCellValue(value) !== "");
}

function getCellValue(sheet, rowIndex, columnIndex) {
  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = sheet[cellAddress];
  if (!cell) return "";

  return cleanCellValue(cell.w ?? cell.v);
}

function getRowValues(sheet, rowIndex, startColumn, endColumn) {
  const values = [];
  for (let columnIndex = startColumn; columnIndex <= endColumn; columnIndex += 1) {
    values.push(getCellValue(sheet, rowIndex, columnIndex));
  }
  return values;
}

function getRowOutlineLevel(sheet, rowIndex) {
  const rawLevel = Number(sheet["!rows"]?.[rowIndex]?.level || 0);
  return Number.isFinite(rawLevel) && rawLevel > 0 ? Math.min(rawLevel, 6) : 0;
}

function buildColumnLabel(headerRows, index) {
  const parts = [];

  for (const headerRow of headerRows) {
    const value = cleanCellValue(headerRow[index]);
    if (value && !parts.includes(value)) {
      parts.push(value);
    }
  }

  return parts.join(" / ") || excelColumnName(index);
}

export async function getXlsx1cReport(report) {
  const safeFileName = path.basename(report.fileName || "");
  const filePath = path.resolve(getImportDir(), safeFileName);

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, {
      cellDates: false,
      cellStyles: true,
      raw: false,
    });
  } catch {
    throw new NotFound("XLSX report file not found");
  }

  const { name: sheetName, sheet } = getSheet(workbook, report.sheetName);
  if (!sheet) {
    throw new NotFound("XLSX report sheet not found");
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const startColumn = range.s.c;
  const endColumn = range.e.c;

  const headerIndex = Math.max(Number(report.headerRow || 1) - 1, 0);
  const dataStartIndex = Math.max(Number(report.dataStartRow || headerIndex + 2) - 1, 0);
  const headerRows = [];

  for (let index = headerIndex; index < dataStartIndex; index += 1) {
    const row = getRowValues(sheet, index, startColumn, endColumn);
    if (rowHasData(row)) {
      headerRows.push({
        rowNumber: index + 1,
        cells: row,
      });
    }
  }

  const dataRows = [];

  for (let index = dataStartIndex; index <= range.e.r; index += 1) {
    const row = getRowValues(sheet, index, startColumn, endColumn);
    if (!rowHasData(row)) continue;

    dataRows.push({
      row,
      rowIndex: index,
      outlineLevel: getRowOutlineLevel(sheet, index),
    });
  }

  const maxColumnCount = endColumn - startColumn + 1;
  const rawHeaderRows = headerRows.map((row) => row.cells);

  const columns = Array.from({ length: maxColumnCount }, (_, index) => {
    const headerValues = rawHeaderRows
      .map((row) => cleanCellValue(row[index]))
      .filter(Boolean);
    const label = buildColumnLabel(rawHeaderRows, index);
    const hasData = dataRows.some(({ row }) => cleanCellValue(row[index]) !== "");

    return {
      key: `c${index}`,
      index,
      label,
      headerValues,
      hasData,
    };
  }).filter((column) => column.headerValues.length || column.hasData);

  const visibleHeaderRows = headerRows.map((row) => ({
    rowNumber: row.rowNumber,
    cells: columns.map((column) => cleanCellValue(row.cells[column.index])),
  }));

  const rows = dataRows.map(({ row, rowIndex, outlineLevel }) => ({
    rowNumber: rowIndex + 1,
    outlineLevel,
    cells: columns.map((column) => cleanCellValue(row[column.index])),
  }));

  return {
    meta: {
      reportKey: report.reportKey,
      title: report.menuTitle,
      fileName: safeFileName,
      sheetName,
      headerRow: Number(report.headerRow || 1),
      dataStartRow: Number(report.dataStartRow || headerIndex + 2),
      rows: rows.length,
      columns: columns.length,
    },
    columns,
    headerRows: visibleHeaderRows,
    rows,
  };
}
