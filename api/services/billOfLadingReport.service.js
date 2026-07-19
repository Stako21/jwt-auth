import fs from "fs/promises";
import path from "path";
import pool from "../db.cjs";
import { getImportDir, getImportSourcePath } from "./appConfig.service.js";
import { BadRequest } from "../utils/Errors.js";
import { ROLE_IDS } from "../utils/roles.js";
import { syncWarehousesFromRows } from "./warehouseSettings.service.js";

const MIN_RETENTION_DAYS = 180;
const DEFAULT_RETENTION_DAYS = 365;
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

function normalizeGuid(value) {
  return String(value || "").trim().toLowerCase() || null;
}

function getRetentionDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days)) return DEFAULT_RETENTION_DAYS;
  return Math.max(days, MIN_RETENTION_DAYS);
}

async function getConfiguredRetentionDays(branchId) {
  const [[row]] = await pool.query(
    `
    SELECT retention_days AS retentionDays
    FROM report_definitions
    WHERE branch_id = ?
      AND report_key = 'report-bill-of-lading'
    LIMIT 1
    `,
    [branchId],
  );
  return getRetentionDays(row?.retentionDays);
}

function normalizeDateKey(value, fallback) {
  const date = String(value || "").trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : fallback;
}

function normalizeRow(row) {
  const scanDate = parseDate(row?.scanDate);
  if (!scanDate) return null;

  const documentDate = parseDate(row?.documentDate);

  return {
    reportDate: getShiftDate(scanDate),
    warehouseName: String(row?.warehouseName || "").trim() || null,
    warehouseGuid: normalizeGuid(row?.warehouseGUID),
    picker: String(row?.picker || "").trim() || null,
    pickerGuid: normalizeGuid(row?.pickerGUID),
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
  const [[latestRow]] = await connection.query(
    `
    SELECT
      warehouse_guid AS warehouseGuid,
      picker_guid AS pickerGuid,
      updated_at AS lastUpdatedAt
    FROM bill_of_lading_report_rows
    WHERE branch_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [branchId],
  );

  if (!latestRow) return true;
  if (!latestRow.warehouseGuid || !latestRow.pickerGuid) return true;

  const lastUpdatedAt = latestRow.lastUpdatedAt
    ? new Date(latestRow.lastUpdatedAt)
    : null;

  if (!lastUpdatedAt || Number.isNaN(lastUpdatedAt.getTime())) return true;

  return lastUpdatedAt < modifiedAt;
}

async function pruneOldRows(connection, branchId, retentionDays) {
  await connection.query(
    `
    DELETE FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND report_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, getRetentionDays(retentionDays)],
  );
}

async function pruneOldRowsWithPool(branchId, retentionDays) {
  await pool.query(
    `
    DELETE FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND report_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, getRetentionDays(retentionDays)],
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
        warehouse_guid,
        picker,
        picker_guid,
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
          row.warehouseGuid,
          row.picker,
          row.pickerGuid,
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

export async function syncBillOfLadingReportFromFile({
  branchId,
  fileName,
  retentionDays,
}) {
  const source = await readSource(fileName);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await pruneOldRows(connection, branchId, retentionDays);

    if (!source) {
      await connection.commit();
      return { imported: false, rows: 0 };
    }

    if (!(await shouldImportSourceRows(connection, branchId, source.modifiedAt))) {
      await connection.commit();
      return { imported: false, rows: 0 };
    }

    const rows = source.rows.map(normalizeRow).filter(Boolean);
    await syncWarehousesFromRows(connection, branchId, rows);
    await replaceRowsForSourceDates(connection, branchId, source, rows);
    await pruneOldRows(connection, branchId, retentionDays);

    await connection.commit();
    return { imported: true, rows: rows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getPickerGuid(userId, branchId) {
  const [[user]] = await pool.query(
    `
    SELECT user_guid AS userGuid
    FROM users
    WHERE id = ? AND branch_id = ? AND is_active = 1
    LIMIT 1
    `,
    [userId, branchId],
  );
  return normalizeGuid(user?.userGuid);
}

export async function getBillOfLadingReportRows({
  branchId,
  userId,
  role,
  retentionDays,
  dateFrom,
  dateTo,
}) {
  const today = toSqlDate(new Date());
  const normalizedFrom = normalizeDateKey(dateFrom, today);
  const normalizedTo = normalizeDateKey(dateTo, today);
  if (normalizedFrom > normalizedTo) {
    throw new BadRequest("dateFrom не може бути пізніше dateTo");
  }
  const isPicker = Number(role) === ROLE_IDS.Picker;
  const pickerGuid = isPicker ? await getPickerGuid(userId, branchId) : null;
  if (isPicker && !pickerGuid) {
    throw new BadRequest(
      "Для комплектувальника не вказано UserGUID. Зверніться до адміністратора.",
    );
  }

  const [rows] = await pool.query(
    `
    SELECT
      DATE_FORMAT(report_rows.report_date, '%Y-%m-%d') AS reportDate,
      report_rows.warehouse_name AS warehouseName,
      report_rows.warehouse_guid AS warehouseGuid,
      report_rows.picker,
      report_rows.picker_guid AS pickerGuid,
      report_rows.document_number AS documentNumber,
      DATE_FORMAT(report_rows.document_datetime, '%Y-%m-%dT%H:%i:%s') AS documentDate,
      DATE_FORMAT(report_rows.scan_datetime, '%Y-%m-%dT%H:%i:%s') AS scanDate,
      report_rows.documents_count AS documentsCount,
      report_rows.rows_count AS rowsCount,
      report_rows.weight,
      report_rows.amount,
      rate.row_rate AS rowRate,
      rate.kilogram_rate AS kilogramRate,
      CASE WHEN rate.id IS NULL THEN NULL ELSE report_rows.rows_count * rate.row_rate END AS rowEarnings,
      CASE WHEN rate.id IS NULL THEN NULL ELSE report_rows.weight * rate.kilogram_rate END AS kilogramEarnings
    FROM bill_of_lading_report_rows report_rows
    LEFT JOIN warehouses warehouse
      ON warehouse.branch_id = report_rows.branch_id
     AND warehouse.warehouse_guid = report_rows.warehouse_guid
    LEFT JOIN warehouse_rate_history rate
      ON rate.id = (
        SELECT history.id
        FROM warehouse_rate_history history
        WHERE history.warehouse_id = warehouse.id
          AND history.effective_from <= report_rows.report_date
        ORDER BY history.effective_from DESC, history.id DESC
        LIMIT 1
      )
    WHERE report_rows.branch_id = ?
      AND report_rows.report_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND report_rows.report_date BETWEEN ? AND ?
      AND (? IS NULL OR report_rows.picker_guid = ?)
    ORDER BY report_rows.report_date DESC, report_rows.warehouse_name, report_rows.picker, report_rows.scan_datetime
    `,
    [
      branchId,
      getRetentionDays(retentionDays),
      normalizedFrom,
      normalizedTo,
      pickerGuid,
      pickerGuid,
    ],
  );

  return rows;
}

export async function getBillOfLadingReport({
  branchId,
  userId,
  role,
  fileName,
  retentionDays,
  dateFrom,
  dateTo,
}) {
  const source = await getImportSourcePath(
    IMPORT_SOURCE_KEY,
    fileName || DEFAULT_SOURCE_FILE,
  );

  if (source?.isActive && source?.filePath) {
    await syncBillOfLadingReportFromFile({
      branchId,
      fileName: source.filePath,
      retentionDays,
    });
  } else {
    await pruneOldRowsWithPool(branchId, retentionDays);
  }

  return getBillOfLadingReportRows({
    branchId,
    userId,
    role,
    retentionDays,
    dateFrom,
    dateTo,
  });
}

export async function getPickerEarningsReport({
  branchId,
  fileName,
  dateFrom,
  dateTo,
}) {
  const days = await getConfiguredRetentionDays(branchId);
  const fallbackTo = toSqlDate(new Date());
  const fallbackFromDate = new Date();
  fallbackFromDate.setDate(fallbackFromDate.getDate() - 30);
  const normalizedFrom = normalizeDateKey(dateFrom, toSqlDate(fallbackFromDate));
  const normalizedTo = normalizeDateKey(dateTo, fallbackTo);
  if (normalizedFrom > normalizedTo) {
    throw new BadRequest("dateFrom не може бути пізніше dateTo");
  }

  const source = await getImportSourcePath(
    IMPORT_SOURCE_KEY,
    fileName || DEFAULT_SOURCE_FILE,
  );
  if (source?.isActive && source?.filePath) {
    await syncBillOfLadingReportFromFile({
      branchId,
      fileName: source.filePath,
      retentionDays: days,
    });
  } else {
    await pruneOldRowsWithPool(branchId, days);
  }

  const [rows] = await pool.query(
    `
    SELECT
      report_rows.picker_guid AS pickerGuid,
      COALESCE(NULLIF(TRIM(COALESCE(picker_user.user_name, picker_user.name)), ''), report_rows.picker, 'Без комплектувальника') AS picker,
      report_rows.warehouse_guid AS warehouseGuid,
      COALESCE(warehouse.warehouse_name, report_rows.warehouse_name, 'Без складу') AS warehouseName,
      SUM(report_rows.documents_count) AS documentsCount,
      SUM(report_rows.rows_count) AS rowsCount,
      SUM(report_rows.weight) AS weight,
      SUM(report_rows.amount) AS amount,
      SUM(CASE WHEN rate.id IS NULL THEN 0 ELSE report_rows.rows_count * rate.row_rate END) AS rowEarnings,
      SUM(CASE WHEN rate.id IS NULL THEN 0 ELSE report_rows.weight * rate.kilogram_rate END) AS kilogramEarnings,
      SUM(CASE WHEN rate.id IS NULL THEN 1 ELSE 0 END) AS missingRateRows,
      MAX(CASE WHEN picker_user.id IS NULL THEN 1 ELSE 0 END) AS missingUser
    FROM bill_of_lading_report_rows report_rows
    LEFT JOIN warehouses warehouse
      ON warehouse.branch_id = report_rows.branch_id
     AND warehouse.warehouse_guid = report_rows.warehouse_guid
    LEFT JOIN users picker_user
      ON picker_user.branch_id = report_rows.branch_id
     AND picker_user.user_guid = report_rows.picker_guid
     AND picker_user.is_active = 1
    LEFT JOIN warehouse_rate_history rate
      ON rate.id = (
        SELECT history.id
        FROM warehouse_rate_history history
        WHERE history.warehouse_id = warehouse.id
          AND history.effective_from <= report_rows.report_date
        ORDER BY history.effective_from DESC, history.id DESC
        LIMIT 1
      )
    WHERE report_rows.branch_id = ?
      AND report_rows.report_date BETWEEN ? AND ?
    GROUP BY
      report_rows.picker_guid,
      COALESCE(NULLIF(TRIM(COALESCE(picker_user.user_name, picker_user.name)), ''), report_rows.picker, 'Без комплектувальника'),
      report_rows.warehouse_guid,
      COALESCE(warehouse.warehouse_name, report_rows.warehouse_name, 'Без складу')
    ORDER BY picker, warehouseName
    `,
    [branchId, normalizedFrom, normalizedTo],
  );

  return {
    meta: { dateFrom: normalizedFrom, dateTo: normalizedTo },
    rows,
  };
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
  const retentionDays = await getConfiguredRetentionDays(branchId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await pruneOldRows(connection, branchId, retentionDays);
    await syncWarehousesFromRows(connection, branchId, rows);
    await replaceRowsForSourceDates(connection, branchId, sourceRows, rows);
    await pruneOldRows(connection, branchId, retentionDays);
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
