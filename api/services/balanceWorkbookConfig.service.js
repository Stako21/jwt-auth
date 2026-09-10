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

function buildHeaders(row = []) {
  return row
    .map((value, sourceIndex) => ({
      id: `column-${sourceIndex}`,
      sourceIndex,
      columnLetter: XLSX.utils.encode_col(sourceIndex),
      sourceHeader: String(value ?? "").trim(),
    }))
    .filter((column) => column.sourceHeader);
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
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
  });

  return { sheetName, rows };
}

export async function inspectBalanceWorkbook({
  importDir,
  fileName,
  headerRow,
  dataStartRow,
}) {
  const { sheetName, rows } = await readWorkbook(importDir, fileName);
  const suggestedDataStartRow = findDataStartRow(rows);
  const effectiveDataStartRow = dataStartRow
    ? requirePositiveRow(dataStartRow, "Перший рядок даних")
    : suggestedDataStartRow;
  const suggestedHeaderRow = findHeaderRow(rows, effectiveDataStartRow);
  const effectiveHeaderRow = headerRow
    ? requirePositiveRow(headerRow, "Рядок заголовків")
    : suggestedHeaderRow;

  if (effectiveHeaderRow >= effectiveDataStartRow) {
    throw new BadRequest("Рядок заголовків має бути перед першим рядком даних");
  }
  if (effectiveHeaderRow > rows.length || effectiveDataStartRow > rows.length + 1) {
    throw new BadRequest("Вказані рядки виходять за межі XLSX-файлу");
  }

  const headers = buildHeaders(rows[effectiveHeaderRow - 1]);
  if (!headers.length) {
    throw new BadRequest("У вибраному рядку заголовків не знайдено значень");
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

  return { version: 1, columns, priceColumnId };
}

export async function validateBalanceWorkbookConfiguration({
  importDir,
  fileName,
  headerRow,
  dataStartRow,
  columnConfig,
}) {
  if (!columnConfig) return;
  const structure = await inspectBalanceWorkbook({
    importDir,
    fileName,
    headerRow,
    dataStartRow,
  });
  const headersByIndex = new Map(
    structure.headers.map((header) => [header.sourceIndex, header.sourceHeader]),
  );

  for (const column of columnConfig.columns) {
    const actualHeader = headersByIndex.get(column.sourceIndex) || "";
    if (normalizeHeader(actualHeader) !== normalizeHeader(column.sourceHeader)) {
      throw new BadRequest(
        `Структура XLSX змінилася: у колонці ${XLSX.utils.encode_col(column.sourceIndex)} ` +
        `очікувався заголовок «${column.sourceHeader}», отримано «${actualHeader || "порожньо"}»`,
      );
    }
  }
}
