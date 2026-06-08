import fs from "fs/promises";
import path from "path";
import XLSX from "xlsx";
import pool from "../db.cjs";
import { NotFound } from "../utils/Errors.js";
import { getImportDir, getSystemBranch } from "./appConfig.service.js";

const DEFAULT_RETENTION_DAYS = 31;
const INSERT_CHUNK_SIZE = 500;
const SERVICE_METRIC_LABEL_PREFIX = "Группа / Супервайзер / Торговый агент";
const GUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toSqlDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toSqlDateTime(date) {
  return `${toSqlDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function cleanText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function getCell(sheet, rowIndex, columnIndex) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  return sheet[address] || null;
}

function getCellText(sheet, rowIndex, columnIndex) {
  const cell = getCell(sheet, rowIndex, columnIndex);
  if (!cell) return "";
  return cleanText(cell.w ?? cell.v);
}

function getCellNumber(sheet, rowIndex, columnIndex) {
  const cell = getCell(sheet, rowIndex, columnIndex);
  if (!cell) return null;
  if (cell.t === "e") return null;

  if (cell.t === "n" && Number.isFinite(Number(cell.v))) {
    return Number(cell.v);
  }

  const normalized = cleanText(cell.w ?? cell.v)
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  if (!normalized) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function getSheet(workbook, sheetName) {
  if (sheetName && workbook.Sheets[sheetName]) {
    return { sheetName, sheet: workbook.Sheets[sheetName] };
  }

  const firstSheetName = workbook.SheetNames[0];
  return { sheetName: firstSheetName, sheet: workbook.Sheets[firstSheetName] };
}

function parseUkrainianDateTime(value) {
  const match = cleanText(value).match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseReportDate(sheet, range) {
  for (let rowIndex = range.s.r; rowIndex <= Math.min(range.e.r, 12); rowIndex += 1) {
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const value = getCellText(sheet, rowIndex, columnIndex);
      if (!value.toLocaleLowerCase().includes("начало периода")) continue;

      const date = parseUkrainianDateTime(value);
      if (date) return toSqlDate(date);
    }
  }

  return null;
}

function slugifyMetricKey(label, fallback) {
  const normalized = cleanText(label)
    .toLocaleLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function isDateLikeHeader(value) {
  return /^\d{2}\.\d{2}\.\d{4}/.test(cleanText(value));
}

function isServiceMetricLabel(value) {
  return cleanText(value).startsWith(SERVICE_METRIC_LABEL_PREFIX);
}

function getHeaderValueWithMerges(sheet, rowIndex, columnIndex) {
  const directValue = getCellText(sheet, rowIndex, columnIndex);
  if (directValue) return directValue;

  for (const merge of sheet["!merges"] || []) {
    if (
      rowIndex >= merge.s.r &&
      rowIndex <= merge.e.r &&
      columnIndex >= merge.s.c &&
      columnIndex <= merge.e.c
    ) {
      return getCellText(sheet, merge.s.r, merge.s.c);
    }
  }

  return "";
}

function hasColumnNumericData(sheet, columnIndex, dataStartRow, endRow) {
  const startIndex = Math.max(Number(dataStartRow || 1) - 1, 0);

  for (let rowIndex = startIndex; rowIndex <= endRow; rowIndex += 1) {
    if (getCellNumber(sheet, rowIndex, columnIndex) !== null) return true;
  }

  return false;
}

function buildMetricColumns(sheet, range, headerRow, dataStartRow) {
  const headerStartIndex = Math.max(Number(headerRow || 1) - 1, range.s.r);
  const headerEndIndex = Math.max(Number(dataStartRow || headerRow + 1) - 2, headerStartIndex);
  const columns = [];

  for (let columnIndex = range.s.c + 1; columnIndex <= range.e.c; columnIndex += 1) {
    const headerParts = [];

    for (let rowIndex = headerStartIndex; rowIndex <= headerEndIndex; rowIndex += 1) {
      const value = getHeaderValueWithMerges(sheet, rowIndex, columnIndex);
      if (!value || isDateLikeHeader(value)) continue;
      if (!headerParts.includes(value)) headerParts.push(value);
    }

    const label = headerParts.join(" / ");
    const hasData = hasColumnNumericData(sheet, columnIndex, dataStartRow, range.e.r);

    if (!hasData || isServiceMetricLabel(label)) continue;

    columns.push({
      columnIndex,
      metricOrder: columns.length,
      key: slugifyMetricKey(label, `c${columnIndex}`),
      label: label || XLSX.utils.encode_col(columnIndex),
    });
  }

  return columns;
}

function parseAgentIdentity(value) {
  const text = cleanText(value);
  const match = text.match(new RegExp(`^(.*?)\\s*\\((${GUID_PATTERN})\\)\\s*$`, "i"));
  if (!match) return null;

  return {
    agentName: cleanText(match[1]),
    agentGuid: match[2].toLowerCase(),
  };
}

async function getAgentMappings(connection, branchId) {
  const [rows] = await connection.query(
    `
    SELECT
      LOWER(sa.current_agent_guid) AS agentGuid,
      sa.user_id AS userId,
      sa.full_name AS agentName,
      u.user_name AS userName
    FROM sales_agents sa
    JOIN users u ON u.id = sa.user_id
    WHERE sa.branch_id = ?
      AND u.branch_id = ?
      AND u.is_active = 1
      AND sa.current_agent_guid IS NOT NULL
      AND sa.current_agent_guid <> ''
    `,
    [branchId, branchId],
  );

  const byGuid = new Map();

  for (const row of rows) {
    const guid = cleanText(row.agentGuid).toLowerCase();
    if (!guid) continue;

    if (!byGuid.has(guid)) byGuid.set(guid, []);
    byGuid.get(guid).push({
      userId: Number(row.userId),
      agentName: cleanText(row.agentName),
      userName: cleanText(row.userName),
    });
  }

  return byGuid;
}

function resolveUserId(agentMappings, agentGuid, agentName) {
  const matches = agentMappings.get(agentGuid) || [];
  if (matches.length === 0) return null;

  const uniqueUserIds = [...new Set(matches.map((match) => match.userId))];
  if (uniqueUserIds.length === 1) return uniqueUserIds[0];

  const nameMatches = matches.filter(
    (match) => match.agentName === agentName || match.userName === agentName,
  );
  const nameUserIds = [...new Set(nameMatches.map((match) => match.userId))];
  return nameUserIds.length === 1 ? nameUserIds[0] : null;
}

function parseRowsFromSheet({ sheet, range, report, reportDate, agentMappings }) {
  const dataStartIndex = Math.max(Number(report.dataStartRow || 1) - 1, range.s.r);
  const metricColumns = buildMetricColumns(sheet, range, report.headerRow, report.dataStartRow);
  const parsedRows = [];

  for (let rowIndex = dataStartIndex; rowIndex <= range.e.r; rowIndex += 1) {
    const identity = parseAgentIdentity(getCellText(sheet, rowIndex, range.s.c));
    if (!identity) continue;

    const rowHasValues = metricColumns.some(
      (metric) => getCellNumber(sheet, rowIndex, metric.columnIndex) !== null,
    );
    if (!rowHasValues) continue;

    const userId = resolveUserId(
      agentMappings,
      identity.agentGuid,
      identity.agentName,
    );

    for (const metric of metricColumns) {
      const value = getCellNumber(sheet, rowIndex, metric.columnIndex);
      if (value === null) continue;

      parsedRows.push({
        reportDate,
        userId,
        agentGuid: identity.agentGuid,
        agentName: identity.agentName,
        rowNumber: rowIndex + 1,
        metricOrder: metric.metricOrder,
        metricKey: metric.key,
        metricLabel: metric.label,
        metricValue: value,
      });
    }
  }

  return {
    metrics: metricColumns,
    rows: parsedRows,
  };
}

async function readSourceWorkbook(report) {
  const safeFileName = path.basename(report.fileName || "");
  const filePath = path.resolve(getImportDir(), safeFileName);

  let fileStat;
  try {
    fileStat = await fs.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new NotFound("XLSX report file not found");
    throw error;
  }

  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    cellStyles: true,
    raw: true,
  });

  const { sheetName, sheet } = getSheet(workbook, report.sheetName);
  if (!sheet) throw new NotFound("XLSX report sheet not found");

  return {
    safeFileName,
    sheetName,
    sheet,
    modifiedAt: fileStat.mtime,
  };
}

async function shouldImport(connection, branchId, reportKey, modifiedAt) {
  const [[legacyMetric]] = await connection.query(
    `
    SELECT 1
    FROM xlsx_1c_sales_report_values
    WHERE branch_id = ?
      AND report_key = ?
      AND metric_label LIKE ?
    LIMIT 1
    `,
    [branchId, reportKey, `${SERVICE_METRIC_LABEL_PREFIX}%`],
  );

  if (legacyMetric) return true;

  const [[state]] = await connection.query(
    `
    SELECT MAX(source_file_mtime) AS sourceFileMtime
    FROM xlsx_1c_sales_report_values
    WHERE branch_id = ?
      AND report_key = ?
    `,
    [branchId, reportKey],
  );

  const currentMtime = state?.sourceFileMtime ? new Date(state.sourceFileMtime) : null;
  return !currentMtime || currentMtime < modifiedAt;
}

async function pruneOldRows(connection, branchId, reportKey, retentionDays) {
  await connection.query(
    `
    DELETE FROM xlsx_1c_sales_report_values
    WHERE branch_id = ?
      AND report_key = ?
      AND report_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `,
    [branchId, reportKey, retentionDays],
  );
}

async function replaceReportDateRows(connection, branchId, report, source, rows, reportDate) {
  await connection.query(
    `
    DELETE FROM xlsx_1c_sales_report_values
    WHERE branch_id = ?
      AND report_key = ?
      AND report_date = ?
    `,
    [branchId, report.reportKey, reportDate],
  );

  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    await connection.query(
      `
      INSERT INTO xlsx_1c_sales_report_values (
        branch_id,
        report_key,
        report_date,
        user_id,
        agent_guid,
        agent_name,
        source_row_number,
        metric_order,
        metric_key,
        metric_label,
        metric_value,
        source_file_name,
        source_file_mtime
      )
      VALUES ?
      `,
      [
        chunk.map((row) => [
          branchId,
          report.reportKey,
          row.reportDate,
          row.userId,
          row.agentGuid,
          row.agentName,
          row.rowNumber,
          row.metricOrder,
          row.metricKey,
          row.metricLabel,
          row.metricValue,
          source.safeFileName,
          toSqlDateTime(source.modifiedAt),
        ]),
      ],
    );
  }
}

export async function syncXlsx1cSalesReport({ branchId, report }) {
  const source = await readSourceWorkbook(report);
  const connection = await pool.getConnection();
  const retentionDays = Number(report.retentionDays || DEFAULT_RETENTION_DAYS);

  try {
    await connection.beginTransaction();
    await pruneOldRows(connection, branchId, report.reportKey, retentionDays);

    if (!(await shouldImport(connection, branchId, report.reportKey, source.modifiedAt))) {
      await connection.commit();
      return { imported: false, rows: 0 };
    }

    const range = XLSX.utils.decode_range(source.sheet["!ref"] || "A1:A1");
    const reportDate = parseReportDate(source.sheet, range);

    if (!reportDate) {
      throw new Error("Report date not found in XLSX parameters");
    }

    const agentMappings = await getAgentMappings(connection, branchId);
    const { rows } = parseRowsFromSheet({
      sheet: source.sheet,
      range,
      report,
      reportDate,
      agentMappings,
    });

    await replaceReportDateRows(connection, branchId, report, source, rows, reportDate);
    await pruneOldRows(connection, branchId, report.reportKey, retentionDays);
    await connection.commit();

    return { imported: true, rows: rows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function loadScheduledXlsx1cSalesReports() {
  const branch = await getSystemBranch();
  const branchId = Number(branch.id);

  const [reports] = await pool.query(
    `
    SELECT
      report_key AS reportKey,
      menu_title AS menuTitle,
      file_name AS fileName,
      sheet_name AS sheetName,
      header_row AS headerRow,
      data_start_row AS dataStartRow,
      retention_days AS retentionDays,
      scheduled_import_enabled AS scheduledImportEnabled
    FROM report_definitions
    WHERE branch_id = ?
      AND is_active = 1
      AND report_type = 'xlsx-1c-sales'
      AND scheduled_import_enabled = 1
    ORDER BY sort_order, menu_title
    `,
    [branchId],
  );

  if (!reports.length) {
    return {
      status: "skipped",
      code: "no_scheduled_reports",
      message: "No scheduled XLSX 1C sales reports configured",
      details: {
        branchId,
      },
    };
  }

  const results = [];
  let failedCount = 0;
  let importedMetricRows = 0;

  for (const report of reports) {
    try {
      const result = await syncXlsx1cSalesReport({
        branchId,
        report: {
          ...report,
          headerRow: report.headerRow === null ? null : Number(report.headerRow),
          dataStartRow:
            report.dataStartRow === null ? null : Number(report.dataStartRow),
          retentionDays:
            report.retentionDays === null ? null : Number(report.retentionDays),
        },
      });

      importedMetricRows += Number(result.rows || 0);
      results.push({
        reportKey: report.reportKey,
        imported: Boolean(result.imported),
        rows: Number(result.rows || 0),
      });
    } catch (error) {
      failedCount += 1;
      results.push({
        reportKey: report.reportKey,
        failed: true,
        errorMessage: error.message,
      });
    }
  }

  if (failedCount > 0) {
    return {
      status: "completed_with_warnings",
      code: "some_reports_failed",
      message: "Some scheduled XLSX 1C sales reports failed",
      details: {
        branchId,
        reportsCount: reports.length,
        failedCount,
        importedMetricRows,
        reports: results,
      },
    };
  }

  return {
    status: "completed",
    code: "scheduled_reports_imported",
    message: "Scheduled XLSX 1C sales reports imported",
    details: {
      branchId,
      reportsCount: reports.length,
      importedMetricRows,
      reports: results,
    },
  };
}

export async function getXlsx1cSalesReport({ branchId, report, dateFrom, dateTo }) {
  if (!report.scheduledImportEnabled) {
    await syncXlsx1cSalesReport({ branchId, report });
  }

  const retentionDays = Number(report.retentionDays || DEFAULT_RETENTION_DAYS);
  const params = [branchId, report.reportKey, retentionDays];
  const where = [
    "v.branch_id = ?",
    "v.report_key = ?",
    "v.report_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)",
    "v.metric_label NOT LIKE ?",
  ];
  params.push(`${SERVICE_METRIC_LABEL_PREFIX}%`);

  if (dateFrom) {
    where.push("v.report_date >= ?");
    params.push(dateFrom);
  }

  if (dateTo) {
    where.push("v.report_date <= ?");
    params.push(dateTo);
  }

  const whereSql = where.join(" AND ");

  const [metricRows] = await pool.query(
    `
    SELECT
      v.metric_key AS metricKey,
      v.metric_label AS metricLabel,
      MIN(v.metric_order) AS metricOrder
    FROM xlsx_1c_sales_report_values v
    WHERE ${whereSql}
    GROUP BY v.metric_key, v.metric_label
    ORDER BY metricOrder, metricLabel
    `,
    params,
  );

  const [rows] = await pool.query(
    `
    SELECT
      v.user_id AS userId,
      COALESCE(u.user_name, v.agent_name) AS agentName,
      COALESCE(supervisor.user_name, 'Без СВ') AS supervisorName,
      v.metric_key AS metricKey,
      SUM(v.metric_value) AS metricValue
    FROM xlsx_1c_sales_report_values v
    JOIN users u
      ON u.id = v.user_id
      AND u.branch_id = v.branch_id
      AND u.is_active = 1
    LEFT JOIN user_hierarchy hierarchy
      ON hierarchy.child_user_id = v.user_id
    LEFT JOIN users supervisor
      ON supervisor.id = hierarchy.parent_user_id
      AND supervisor.branch_id = v.branch_id
      AND supervisor.is_active = 1
    WHERE ${whereSql}
      AND v.user_id IS NOT NULL
    GROUP BY v.user_id, agentName, supervisorName, v.metric_key
    ORDER BY supervisorName, agentName, v.metric_key
    `,
    params,
  );

  const [excludedRows] = await pool.query(
    `
    SELECT DISTINCT
      v.agent_name AS agentName,
      v.agent_guid AS agentGuid
    FROM xlsx_1c_sales_report_values v
    LEFT JOIN users u
      ON u.id = v.user_id
      AND u.branch_id = v.branch_id
      AND u.is_active = 1
    WHERE ${whereSql}
      AND (v.user_id IS NULL OR u.id IS NULL)
    ORDER BY v.agent_name
    `,
    params,
  );

  return {
    meta: {
      reportKey: report.reportKey,
      title: report.menuTitle,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      retentionDays,
    },
    metrics: metricRows.map((row) => ({
      key: row.metricKey,
      label: row.metricLabel,
      order: Number(row.metricOrder || 0),
    })),
    rows: rows.map((row) => ({
      userId: row.userId,
      agentName: row.agentName,
      supervisorName: row.supervisorName,
      metricKey: row.metricKey,
      metricValue: Number(row.metricValue || 0),
    })),
    excludedAgents: excludedRows
      .map((row) => (row.agentGuid ? `${row.agentName} (${row.agentGuid})` : row.agentName))
      .filter(Boolean),
  };
}
