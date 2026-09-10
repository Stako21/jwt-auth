import fs from "fs/promises";
import path from "path";
import XLSX from "xlsx";
import { BadRequest, NotFound } from "../utils/Errors.js";

const PREVIEW_ROW_LIMIT = 8;

function normalizeHeader(value) {
  return String(value ?? "").trim().toLocaleLowerCase("uk-UA");
}

function requirePositiveRow(value, fieldName) {
  const row = Number(value);
  if (!Number.isInteger(row) || row < 1) {
    throw new BadRequest(`${fieldName} має бути цілим числом від 1`);
  }
  return row;
}

function findDataStartRow(rows) {
  const index = rows.findIndex(
    (row, rowIndex) => rowIndex > 0 &&
      String(row?.[0] ?? "").trim() &&
      row.slice(1).some((value) => typeof value === "number"),
  );
  return index < 0 ? 1 : index + 1;
}

function findHeaderRow(rows, dataStartRow) {
  for (let index = Math.max(0, dataStartRow - 2); index >= 0; index -= 1) {
    const populated = (rows[index] || []).filter(
      (value) => String(value ?? "").trim(),
    );
    if (populated.length >= 2) return index + 1;
  }
  return Math.max(1, dataStartRow - 1);
}

function getMergedCellValue(rows, merges, rowIndex, columnIndex) {
  const merge = merges.find(({ s, e }) =>
    rowIndex >= s.r && rowIndex <= e.r &&
    columnIndex >= s.c && columnIndex <= e.c);
  const sourceRow = merge ? merge.s.r : rowIndex;
  const sourceColumn = merge ? merge.s.c : columnIndex;
  return rows[sourceRow]?.[sourceColumn] ?? null;
}

function buildHeaders(rows, merges, headerRow, headerEndRow, columnOffset = 0) {
  const startIndex = headerRow - 1;
  const endIndex = headerEndRow - 1;
  const maxRowColumns = rows
    .slice(startIndex, endIndex + 1)
    .reduce((maximum, row) => Math.max(maximum, row?.length || 0), 0);
  const maxMergedColumn = merges
    .filter(({ s, e }) => e.r >= startIndex && s.r <= endIndex)
    .reduce((maximum, { e }) => Math.max(maximum, e.c + 1), 0);
  const columnCount = Math.max(maxRowColumns, maxMergedColumn);

  return Array.from({ length: columnCount }, (_, sourceIndex) => {
    const headerParts = [];
    for (let rowIndex = startIndex; rowIndex <= endIndex; rowIndex += 1) {
      const part = String(getMergedCellValue(rows, merges, rowIndex, sourceIndex) ?? "").trim();
      if (part && !headerParts.some((existing) => normalizeHeader(existing) === normalizeHeader(part))) {
        headerParts.push(part);
      }
    }
    return {
      id: `column-${sourceIndex}`,
      sourceIndex,
      columnLetter: XLSX.utils.encode_col(sourceIndex + columnOffset),
      sourceHeader: headerParts.join(" / "),
      headerParts,
      suggestedTitle: headerParts.at(-1) || "",
    };
  }).filter((column) => column.sourceHeader);
}

async function readWorkbook(importDir, fileName) {
  const normalizedFileName = String(fileName || "").trim();
  const safeFileName = path.basename(normalizedFileName);
  if (!safeFileName || safeFileName !== normalizedFileName) {
    throw new BadRequest("Некоректна назва XLSX-файлу");
  }
  if (!/\.xlsx$/i.test(safeFileName)) {
    throw new BadRequest("Підтримуються лише файли XLSX");
  }

  const filePath = path.resolve(importDir, safeFileName);
  const relativePath = path.relative(path.resolve(importDir), filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new BadRequest("Некоректний шлях XLSX-файлу");
  }

  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new NotFound(`Файл ${safeFileName} не знайдено`);
    }
    throw error;
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequest("XLSX-файл не містить аркушів");
  const sheet = workbook.Sheets[sheetName];
  const sheetRange = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const columnOffset = sheetRange.s.c;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
    range: { s: { r: 0, c: columnOffset }, e: sheetRange.e },
  });
  const merges = (sheet["!merges"] || []).map(({ s, e }) => ({
    s: { r: s.r, c: s.c - columnOffset },
    e: { r: e.r, c: e.c - columnOffset },
  }));

  return { sheetName, rows, merges, columnOffset };
}

export async function inspectBalanceWorkbook({
  importDir,
  fileName,
  headerRow,
  headerEndRow,
  dataStartRow,
}) {
  const { sheetName, rows, merges, columnOffset } = await readWorkbook(importDir, fileName);
  const suggestedDataStartRow = findDataStartRow(rows);
  const effectiveDataStartRow = dataStartRow
    ? requirePositiveRow(dataStartRow, "Перший рядок даних")
    : suggestedDataStartRow;
  const suggestedHeaderRow = findHeaderRow(rows, effectiveDataStartRow);
  const effectiveHeaderRow = headerRow
    ? requirePositiveRow(headerRow, "Рядок заголовків")
    : suggestedHeaderRow;
  const effectiveHeaderEndRow = headerEndRow
    ? requirePositiveRow(headerEndRow, "Останній рядок заголовків")
    : effectiveHeaderRow;

  if (effectiveHeaderEndRow < effectiveHeaderRow) {
    throw new BadRequest("Останній рядок заголовків не може бути перед першим");
  }
  if (effectiveHeaderEndRow >= effectiveDataStartRow) {
    throw new BadRequest("Діапазон заголовків має бути перед першим рядком даних");
  }
  if (effectiveHeaderEndRow > rows.length || effectiveDataStartRow > rows.length + 1) {
    throw new BadRequest("Вказані рядки виходять за межі XLSX-файлу");
  }

  const headers = buildHeaders(
    rows,
    merges,
    effectiveHeaderRow,
    effectiveHeaderEndRow,
    columnOffset,
  );
  if (!headers.length) {
    throw new BadRequest("У вибраному діапазоні заголовків не знайдено значень");
  }

  const previewRows = rows
    .slice(effectiveDataStartRow - 1, effectiveDataStartRow - 1 + PREVIEW_ROW_LIMIT)
    .map((row, index) => ({
      rowNumber: effectiveDataStartRow + index,
      cells: Object.fromEntries(
        headers.map((column) => [column.id, row?.[column.sourceIndex] ?? null]),
      ),
    }));

  return {
    sheetName,
    headerRow: effectiveHeaderRow,
    headerEndRow: effectiveHeaderEndRow,
    dataStartRow: effectiveDataStartRow,
    headers,
    previewRows,
  };
}

export function normalizeBalanceColumnConfig(rawConfig) {
  if (rawConfig === null || rawConfig === undefined || rawConfig === "") return null;

  let config = rawConfig;
  if (typeof config === "string") {
    try {
      config = JSON.parse(config);
    } catch {
      throw new BadRequest("Конфігурація колонок містить некоректний JSON");
    }
  }

  if (!config || !Array.isArray(config.columns) || !config.columns.length) {
    throw new BadRequest("Оберіть хоча б одну колонку для виведення");
  }
  if (config.columns.length > 64) {
    throw new BadRequest("Можна вивести не більше 64 колонок");
  }

  const seenIds = new Set();
  const columns = config.columns.map((column, order) => {
    const sourceIndex = Number(column.sourceIndex);
    const sourceHeader = String(column.sourceHeader || "").trim();
    const title = String(column.title || sourceHeader).trim();
    const id = String(column.id || `column-${sourceIndex}`).trim();
    const role = column.role === "hierarchy" ? "hierarchy" : "value";

    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !sourceHeader || !title || !id ||
      sourceHeader.length > 255 || title.length > 120 || id.length > 64) {
      throw new BadRequest(`Некоректне налаштування колонки №${order + 1}`);
    }
    if (seenIds.has(id)) throw new BadRequest("Ідентифікатори колонок мають бути унікальними");
    seenIds.add(id);
    return { id, sourceIndex, sourceHeader, title, role };
  });

  if (columns.filter((column) => column.role === "hierarchy").length !== 1) {
    throw new BadRequest("Оберіть рівно одну колонку номенклатури та ієрархії");
  }

  const priceColumnId = config.priceColumnId
    ? String(config.priceColumnId).trim()
    : null;
  if (priceColumnId && !seenIds.has(priceColumnId)) {
    throw new BadRequest("Колонка для множника має входити до списку виведених колонок");
  }
  if (priceColumnId && columns.find((column) => column.id === priceColumnId)?.role === "hierarchy") {
    throw new BadRequest("Колонка номенклатури не може одночасно бути колонкою Price");
  }

  return { version: 1, columns, priceColumnId };
}

export async function validateBalanceWorkbookConfiguration({
  importDir,
  fileName,
  headerRow,
  headerEndRow,
  dataStartRow,
  columnConfig,
}) {
  if (!columnConfig) return;
  const structure = await inspectBalanceWorkbook({
    importDir,
    fileName,
    headerRow,
    headerEndRow,
    dataStartRow,
  });
  const headersByIndex = new Map(
    structure.headers.map((header) => [header.sourceIndex, header]),
  );

  for (const column of columnConfig.columns) {
    const actualColumn = headersByIndex.get(column.sourceIndex);
    const actualHeader = actualColumn?.sourceHeader || "";
    if (normalizeHeader(actualHeader) !== normalizeHeader(column.sourceHeader)) {
      throw new BadRequest(
        `Структура XLSX змінилася: у колонці ${actualColumn?.columnLetter || XLSX.utils.encode_col(column.sourceIndex)} ` +
        `очікувався заголовок «${column.sourceHeader}», отримано «${actualHeader || "порожньо"}»`,
      );
    }
  }
}
