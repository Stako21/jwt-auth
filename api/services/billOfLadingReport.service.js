import fs from "fs/promises";
import path from "path";
import pool from "../db.cjs";
import { getImportDir, getImportSourcePath } from "./appConfig.service.js";

const RETENTION_DAYS = 31;
const INSERT_CHUNK_SIZE = 500;
const IMPORT_SOURCE_KEY = "loadBillOfLadingReport";
const DEFAULT_SOURCE_FILE = "BillOfLading.json";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toSqlDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toSqlDateTime(date) {
  return `${toSqlDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDate(value) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function getShiftDate(scanDate) {
  const shiftDate = new Date(scanDate);
  if (shiftDate.getHours() < 8) {
    shiftDate.setDate(shiftDate.getDate() - 1);
  }

  return toSqlDate(shiftDate);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeRow(row) {
  const scanDate = parseDate(row?.scanDate);
  if (!scanDate) return null;

  const documentDate = parseDate(row?.documentDate);

  return {
    reportDate: getShiftDate(scanDate),
    warehouseName: String(row?.warehouseName || "").trim() || null,
    picker: String(row?.picker || "").trim() || null,
    documentNumber: String(row?.documentNumber || "").trim(),
    documentDateTime: documentDate ? toSqlDateTime(documentDate) : null,
    scanDateTime: toSqlDateTime(scanDate),
    documentsCount: Math.max(0, Math.round(toNumber(row?.documentsCount))),
    rowsCount: Math.max(0, Math.round(toNumber(row?.rowsCount))),
    weight: toNumber(row?.weight),
    amount: toNumber(row?.amount),
  };
}

async function readSourceFromPath(filePath) {
  if (!filePath) return null;

  let fileStat;
  try {
    fileStat = await fs.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").replace(/\u0000/g, ""));
  const items = Array.isArray(parsed) ? parsed : parsed?.items;

  if (!Array.isArray(items)) return null;

  return {
    rows: items,
    modifiedAt: fileStat.mtime,
    periodStart: parsed?.periodStart || null,
    periodEnd: parsed?.periodEnd || null,
  };
}

async function readSource(fileName) {
  if (!fileName) return null;

  const filePath = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(getImportDir(), path.basename(fileName));
  return readSourceFromPath(filePath);
}

function getSourceDateKeys(source, rows) {
  const dateKeys = new Set(rows.map((row) => row.reportDate));
  const periodStart = parseDate(source?.periodStart);

  if (periodStart) {
    dateKeys.add(getShiftDate(periodStart));
  }

  return Array.from(dateKeys);
}

async function shouldImportSourceRows(connection, branchId, modifiedAt) {
  const [[state]] = await connection.query(
    `
    SELECT
      COUNT(*) AS rowsCount,
      MAX(updated_at) AS lastUpdatedAt
    FROM bill_of_lading_report_rows
    WHERE branch_id = ?
    `,
    [branchId],
  );

  const rowsCount = Number(state?.rowsCount || 0);
  if (rowsCount === 0) return true;

  const lastUpdatedAt = state?.lastUpdatedAt
    ? new Date(state.lastUpdatedAt)
    : null;

  if (!lastUpdatedAt || Number.isNaN(lastUpdatedAt.getTime())) return true;

  return lastUpdatedAt < modifiedAt;
}

async function pruneOldRows(connection, branchId) {
  await connection.query(
    `
    DELETE FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND report_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, RETENTION_DAYS],
  );
}

async function pruneOldRowsWithPool(branchId) {
  await pool.query(
    `
    DELETE FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND report_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, RETENTION_DAYS],
  );
}

async function replaceRowsForSourceDates(connection, branchId, source, rows) {
  const dateKeys = getSourceDateKeys(source, rows);
  if (!dateKeys.length) return;

  await connection.query(
    `
    DELETE FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND report_date IN (?)
    `,
    [branchId, dateKeys],
  );

  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    await connection.query(
      `
      INSERT INTO bill_of_lading_report_rows (
        branch_id,
        report_date,
        warehouse_name,
        picker,
        document_number,
        document_datetime,
        scan_datetime,
        documents_count,
        rows_count,
        weight,
        amount
      )
      VALUES ?
      `,
      [
        chunk.map((row) => [
          branchId,
          row.reportDate,
          row.warehouseName,
          row.picker,
          row.documentNumber,
          row.documentDateTime,
          row.scanDateTime,
          row.documentsCount,
          row.rowsCount,
          row.weight,
          row.amount,
        ]),
      ],
    );
  }
}

export async function syncBillOfLadingReportFromFile({ branchId, fileName }) {
  const source = await readSource(fileName);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await pruneOldRows(connection, branchId);

    if (!source) {
      await connection.commit();
      return { imported: false, rows: 0 };
    }

    if (!(await shouldImportSourceRows(connection, branchId, source.modifiedAt))) {
      await connection.commit();
      return { imported: false, rows: 0 };
    }

    const rows = source.rows.map(normalizeRow).filter(Boolean);
    await replaceRowsForSourceDates(connection, branchId, source, rows);
    await pruneOldRows(connection, branchId);

    await connection.commit();
    return { imported: true, rows: rows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getBillOfLadingReportRows(branchId) {
  const [rows] = await pool.query(
    `
    SELECT
      DATE_FORMAT(report_date, '%Y-%m-%d') AS reportDate,
      warehouse_name AS warehouseName,
      picker,
      document_number AS documentNumber,
      DATE_FORMAT(document_datetime, '%Y-%m-%dT%H:%i:%s') AS documentDate,
      DATE_FORMAT(scan_datetime, '%Y-%m-%dT%H:%i:%s') AS scanDate,
      documents_count AS documentsCount,
      rows_count AS rowsCount,
      weight,
      amount
    FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND report_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    ORDER BY report_date DESC, warehouse_name, picker, scan_datetime
    `,
    [branchId, RETENTION_DAYS],
  );

  return rows;
}

export async function getBillOfLadingReport({ branchId, fileName }) {
  const source = await getImportSourcePath(
    IMPORT_SOURCE_KEY,
    fileName || DEFAULT_SOURCE_FILE,
  );

  if (source?.isActive && source?.filePath) {
    await syncBillOfLadingReportFromFile({
      branchId,
      fileName: source.filePath,
    });
  } else {
    await pruneOldRowsWithPool(branchId);
  }

  return getBillOfLadingReportRows(branchId);
}

export async function loadBillOfLadingReport() {
  const source = await getImportSourcePath(IMPORT_SOURCE_KEY, DEFAULT_SOURCE_FILE);

  if (!source?.filePath || !source?.isActive) {
    return {
      status: "skipped",
      code: "source_inactive",
      message: "Bill of lading report import source is inactive or not configured",
      details: { sourceKey: IMPORT_SOURCE_KEY },
    };
  }

  const branchId = Number(source.branch.id);
  const sourceRows = await readSourceFromPath(source.filePath);

  if (!sourceRows) {
    return {
      status: "skipped",
      code: "source_missing",
      message: "Bill of lading report source file not found or invalid",
      details: {
        sourceKey: IMPORT_SOURCE_KEY,
        file: source.filePath,
      },
    };
  }

  const rows = sourceRows.rows.map(normalizeRow).filter(Boolean);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await pruneOldRows(connection, branchId);
    await replaceRowsForSourceDates(connection, branchId, sourceRows, rows);
    await pruneOldRows(connection, branchId);
    await connection.commit();

    return {
      status: "completed",
      code: "bill_of_lading_report_loaded",
      message: "Bill of lading report imported successfully",
      details: {
        sourceKey: IMPORT_SOURCE_KEY,
        file: source.filePath,
        branchId,
        rows: rows.length,
      },
    };
  } catch (error) {
    await connection.rollback();
    return {
      status: "failed",
      code: "bill_of_lading_report_import_failed",
      message: "Bill of lading report import failed",
      details: {
        sourceKey: IMPORT_SOURCE_KEY,
        file: source.filePath,
        branchId,
        errorMessage: error.message,
      },
    };
  } finally {
    connection.release();
  }
}
