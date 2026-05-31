import fs from "fs/promises";
import path from "path";
import pool from "../db.cjs";
import { getImportDir, getImportSourcePath } from "./appConfig.service.js";

const RETENTION_DAYS = 31;
const INSERT_CHUNK_SIZE = 500;
const IMPORT_SOURCE_KEY = "loadOrdersByTimeReport";
const DEFAULT_SOURCE_FILE = "OrderByTimet.json";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toSqlDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toSqlDateTime(date) {
  return `${toSqlDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseOrderDate(value) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function normalizeOrderRow(row) {
  const orderDate = parseOrderDate(row?.date);
  if (!orderDate) return null;

  const orderNumber = String(row?.number ?? row?.orderNumber ?? "").trim();

  return {
    orderDate: toSqlDate(orderDate),
    orderDateTime: toSqlDateTime(orderDate),
    orderNumber,
    salesAgent: String(row?.salesAgent || "").trim() || null,
    supervisor: String(row?.supervisor || "").trim() || null,
    city: String(row?.city || "").trim() || null,
  };
}

async function readSourceRowsFromPath(filePath) {
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
  return Array.isArray(parsed)
    ? { rows: parsed, modifiedAt: fileStat.mtime }
    : null;
}

async function readSourceRows(fileName) {
  if (!fileName) return null;

  const filePath = path.isAbsolute(fileName)
    ? fileName
    : path.resolve(getImportDir(), path.basename(fileName));
  return readSourceRowsFromPath(filePath);
}

async function shouldImportSourceRows(connection, branchId, modifiedAt) {
  const [[state]] = await connection.query(
    `
    SELECT
      COUNT(*) AS rowsCount,
      MAX(updated_at) AS lastUpdatedAt
    FROM orders_by_time_report_rows
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
    DELETE FROM orders_by_time_report_rows
    WHERE branch_id = ?
      AND order_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, RETENTION_DAYS],
  );
}

async function pruneOldRowsWithPool(branchId) {
  await pool.query(
    `
    DELETE FROM orders_by_time_report_rows
    WHERE branch_id = ?
      AND order_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, RETENTION_DAYS],
  );
}

async function replaceRowsForSourceDates(connection, branchId, rows) {
  const dateKeys = [...new Set(rows.map((row) => row.orderDate))];
  if (!dateKeys.length) return;

  await connection.query(
    `
    DELETE FROM orders_by_time_report_rows
    WHERE branch_id = ?
      AND order_date IN (?)
    `,
    [branchId, dateKeys],
  );

  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    await connection.query(
      `
      INSERT INTO orders_by_time_report_rows (
        branch_id,
        order_date,
        order_datetime,
        order_number,
        sales_agent,
        supervisor,
        city
      )
      VALUES ?
      `,
      [
        chunk.map((row) => [
          branchId,
          row.orderDate,
          row.orderDateTime,
          row.orderNumber,
          row.salesAgent,
          row.supervisor,
          row.city,
        ]),
      ],
    );
  }
}

export async function syncOrdersByTimeReportFromFile({ branchId, fileName }) {
  const source = await readSourceRows(fileName);
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

    const rows = source.rows.map(normalizeOrderRow).filter(Boolean);

    if (rows.length > 0) {
      await replaceRowsForSourceDates(connection, branchId, rows);
      await pruneOldRows(connection, branchId);
    }

    await connection.commit();
    return { imported: true, rows: rows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getOrdersByTimeReportRows(branchId) {
  const [rows] = await pool.query(
    `
    SELECT
      DATE_FORMAT(order_datetime, '%Y-%m-%dT%H:%i:%s') AS date,
      order_number AS number,
      sales_agent AS salesAgent,
      supervisor,
      city
    FROM orders_by_time_report_rows
    WHERE branch_id = ?
      AND order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    ORDER BY order_datetime DESC, order_number
    `,
    [branchId, RETENTION_DAYS],
  );

  return rows;
}

export async function getOrdersByTimeReport({ branchId, fileName }) {
  const source = await getImportSourcePath(
    IMPORT_SOURCE_KEY,
    fileName || DEFAULT_SOURCE_FILE,
  );

  if (source?.isActive && source?.filePath) {
    await syncOrdersByTimeReportFromFile({
      branchId,
      fileName: source.filePath,
    });
  } else {
    await pruneOldRowsWithPool(branchId);
  }

  return getOrdersByTimeReportRows(branchId);
}

export async function loadOrdersByTimeReport() {
  const source = await getImportSourcePath(IMPORT_SOURCE_KEY, DEFAULT_SOURCE_FILE);

  if (!source?.filePath || !source?.isActive) {
    return {
      status: "skipped",
      code: "source_inactive",
      message: "Orders by time report import source is inactive or not configured",
      details: { sourceKey: IMPORT_SOURCE_KEY },
    };
  }

  const branchId = Number(source.branch.id);
  const sourceRows = await readSourceRowsFromPath(source.filePath);

  if (!sourceRows) {
    return {
      status: "skipped",
      code: "source_missing",
      message: "Orders by time report source file not found or invalid",
      details: {
        sourceKey: IMPORT_SOURCE_KEY,
        file: source.filePath,
      },
    };
  }

  const rows = sourceRows.rows.map(normalizeOrderRow).filter(Boolean);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await pruneOldRows(connection, branchId);

    if (rows.length > 0) {
      await replaceRowsForSourceDates(connection, branchId, rows);
      await pruneOldRows(connection, branchId);
    }

    await connection.commit();

    return {
      status: "completed",
      code: "orders_by_time_report_loaded",
      message: "Orders by time report imported successfully",
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
      code: "orders_by_time_report_import_failed",
      message: "Orders by time report import failed",
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
