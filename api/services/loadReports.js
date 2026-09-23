import fs from "fs/promises";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";
import { getImportSourcePath } from "./appConfig.service.js";
import {
  SalesReportImportError,
  buildSalesReportImportPlan,
  normalizeSalesReportSource,
} from "./salesReportImportPlan.js";

const logger = createTaskLogger("loadSalesReports");
const SALES_REPORT_RETENTION_DAYS = 35;
const LOOKUP_CHUNK_SIZE = 500;

function shiftIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function groupRows(rows, keySelector) {
  const result = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    if (!key) continue;
    const values = result.get(key) || [];
    values.push(row);
    result.set(key, values);
  }
  return result;
}

async function queryInChunks(connection, values, queryChunk) {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  const rows = [];
  for (let index = 0; index < uniqueValues.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueValues.slice(index, index + LOOKUP_CHUNK_SIZE);
    rows.push(...(await queryChunk(chunk)));
  }
  return rows;
}

async function readSourceFile(filePath) {
  let raw = await fs.readFile(filePath, "utf-8");
  raw = raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
  raw = raw.replace(/,\s*(?=[}\]])/g, "");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new SalesReportImportError(
      "JSON_PARSE_FAILED",
      "Sales reports source JSON parse failed",
      { errorMessage: error.message, rawPreview: raw.slice(0, 200) },
    );
  }
}

async function loadLookupState(connection, branchId, rows) {
  const users = await queryInChunks(
    connection,
    rows.map((row) => row.salesAgentGuid),
    async (chunk) => {
      const [found] = await connection.query(
        `SELECT id, NAME, user_name,
                LOWER(current_agent_guid) AS current_agent_guid
         FROM users
         WHERE branch_id = ? AND is_active = 1
           AND LOWER(current_agent_guid) IN (?)`,
        [branchId, chunk],
      );
      return found;
    },
  );

  const agents = await queryInChunks(
    connection,
    rows.flatMap((row) => row.agentLogins),
    async (chunk) => {
      const [found] = await connection.query(
        `SELECT sa.login, sa.user_id, u.id, u.NAME, u.user_name
         FROM sales_agents sa
         INNER JOIN users u
           ON u.id = sa.user_id
          AND u.branch_id = sa.branch_id
          AND u.is_active = 1
         WHERE sa.branch_id = ? AND sa.is_active_1c = 1
           AND sa.login IN (?)`,
        [branchId, chunk],
      );
      return found;
    },
  );

  const existingRows = await queryInChunks(
    connection,
    rows.map((row) => row.documentGuid),
    async (chunk) => {
      const [found] = await connection.query(
        `SELECT sr.*,
                DATE_FORMAT(sr.document_date, '%Y-%m-%d') AS document_date_iso
         FROM sales_reports sr
         WHERE sr.branch_id = ? AND sr.document_guid IN (?)
         ORDER BY sr.created_at DESC, sr.id DESC`,
        [branchId, chunk],
      );
      return found;
    },
  );

  const legacyRows = await queryInChunks(
    connection,
    rows.map((row) => row.number),
    async (chunk) => {
      const [found] = await connection.query(
        `SELECT sr.*,
                DATE_FORMAT(sr.document_date, '%Y-%m-%d') AS document_date_iso
         FROM sales_reports sr
         WHERE sr.branch_id = ? AND sr.document_guid IS NULL
           AND sr.document_number IN (?)
         ORDER BY sr.created_at DESC, sr.id DESC`,
        [branchId, chunk],
      );
      return found;
    },
  );

  return {
    usersByGuid: groupRows(users, (row) => row.current_agent_guid),
    agentsByLogin: groupRows(agents, (row) => row.login),
    existingByGuid: groupRows(existingRows, (row) => row.document_guid),
    legacyByNumber: groupRows(legacyRows, (row) => row.document_number),
  };
}

const nullable = (value) => (typeof value === "undefined" ? null : value);
const sourceAgentName = (row) => row.salesAgent || null;

async function insertReportRow(
  connection,
  { row, user, importId, branchId, status },
) {
  const [result] = await connection.query(
    `INSERT INTO sales_reports (
       report_date, document_number, document_guid, document_date,
       login_agent, user_id, sales_agent_name, sales_agent_guid,
       amount, point_of_sale, customer, comment, form2, status,
       change_comment, import_id, branch_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.docDate,
      row.number,
      row.documentGuid,
      row.originalDate,
      user.loginAgent,
      user.id,
      sourceAgentName(row),
      row.salesAgentGuid,
      row.amount,
      nullable(row.pointOfSale),
      nullable(row.customer),
      nullable(row.comment),
      row.form2 ? 1 : 0,
      status,
      status === "CANCELLED"
        ? "Реалізація відмінена (позначена як видалена в 1С)"
        : null,
      importId,
      branchId,
    ],
  );
  return result.insertId;
}

async function updateCancelledRow(connection, { action, importId }) {
  const { row, user, existing } = action;
  await connection.query(
    `UPDATE sales_reports
     SET report_date = ?, document_number = ?, document_guid = ?,
         document_date = ?, login_agent = ?, user_id = ?,
         sales_agent_name = ?, sales_agent_guid = ?, status = 'CANCELLED',
         change_comment = ?, amount = ?, point_of_sale = ?, customer = ?,
         comment = ?, form2 = ?, import_id = ?
     WHERE id = ?`,
    [
      row.docDate,
      row.number,
      row.documentGuid,
      row.originalDate,
      user.loginAgent,
      user.id,
      sourceAgentName(row),
      row.salesAgentGuid,
      "Реалізація відмінена (позначена як видалена в 1С)",
      row.amount,
      nullable(row.pointOfSale),
      nullable(row.customer),
      nullable(row.comment),
      row.form2 ? 1 : 0,
      importId,
      existing.id,
    ],
  );
}

async function updateActiveRow(connection, { action, importId }) {
  const { row, user, existing } = action;
  await connection.query(
    `UPDATE sales_reports
     SET report_date = ?, document_number = ?, document_guid = ?,
         document_date = ?, login_agent = ?, user_id = ?,
         sales_agent_name = ?, sales_agent_guid = ?, status = 'ACTIVE',
         change_comment = NULL, amount = ?, point_of_sale = ?, customer = ?,
         comment = ?, form2 = ?, import_id = ?, replaced_by_id = NULL
     WHERE id = ?`,
    [
      row.docDate,
      row.number,
      row.documentGuid,
      row.originalDate,
      user.loginAgent,
      user.id,
      sourceAgentName(row),
      row.salesAgentGuid,
      row.amount,
      nullable(row.pointOfSale),
      nullable(row.customer),
      nullable(row.comment),
      row.form2 ? 1 : 0,
      importId,
      existing.id,
    ],
  );
}

async function lockActiveDocument(connection, branchId, documentGuid) {
  const [rows] = await connection.query(
    `SELECT id FROM sales_reports
     WHERE branch_id = ? AND document_guid = ? AND status = 'ACTIVE'
     FOR UPDATE`,
    [branchId, documentGuid],
  );
  return rows.map((row) => Number(row.id));
}

export async function executeSalesReportImportPlan(
  connection,
  plan,
  { importId, branchId },
) {
  const result = {
    insertedCount: 0,
    updatedCount: 0,
    movedCount: 0,
    cancelledCount: 0,
    legacyBackfilledCount: 0,
  };

  for (const action of plan.actions) {
    const { row, user, existing } = action;
    const activeIds = await lockActiveDocument(connection, branchId, row.documentGuid);
    const expectedActiveId = existing?.status === "ACTIVE"
      ? Number(existing.id)
      : null;
    if (
      activeIds.length > 1 ||
      (activeIds.length === 1 && activeIds[0] !== expectedActiveId)
    ) {
      throw new SalesReportImportError(
        "ACTIVE_DOCUMENT_GUID_CONFLICT",
        "Active document state changed after import plan was built",
        { documentGuid: row.documentGuid, activeIds, expectedActiveId },
      );
    }

    if (action.type === "INSERT_NEW") {
      await insertReportRow(connection, {
        row,
        user,
        importId,
        branchId,
        status: row.isDeleted ? "CANCELLED" : "ACTIVE",
      });
      result.insertedCount += 1;
      if (row.isDeleted) result.cancelledCount += 1;
      continue;
    }

    if (action.type === "BACKFILL_LEGACY") {
      result.legacyBackfilledCount += 1;
    }

    if (row.isDeleted) {
      await updateCancelledRow(connection, { action, importId });
      result.updatedCount += 1;
      result.cancelledCount += 1;
      continue;
    }

    if (existing.document_date_iso === row.docDate) {
      await updateActiveRow(connection, { action, importId });
      result.updatedCount += 1;
      continue;
    }

    const moveComment = `Перенесено з ${existing.document_date_iso || "—"} на ${row.docDate}, сума ${row.amount}`;
    await connection.query(
      `UPDATE sales_reports
       SET status = 'MOVED', amount = 0, change_comment = ?,
           document_guid = ?, sales_agent_guid = ?, import_id = ?
       WHERE id = ?`,
      [moveComment, row.documentGuid, row.salesAgentGuid, importId, existing.id],
    );
    const newId = await insertReportRow(connection, {
      row,
      user,
      importId,
      branchId,
      status: "ACTIVE",
    });
    await connection.query(
      "UPDATE sales_reports SET replaced_by_id = ? WHERE id = ?",
      [newId, existing.id],
    );
    result.insertedCount += 1;
    result.movedCount += 1;
  }
  return result;
}

function summarizePlan(plan) {
  return {
    ...plan.counters,
    diagnostics: plan.diagnostics,
    hardConflicts: plan.hardConflicts,
  };
}

async function runSalesReportImport(
  source,
  { dryRun = false, skipRetentionCleanup = false } = {},
) {
  const salesFile = source?.filePath;
  const runLog = logger.start(dryRun ? "dry-run started" : "loader started", {
    file: salesFile,
  });
  let connection;
  let advisoryLockAcquired = false;

  try {
    if (!salesFile || !source?.isActive) {
      return {
        status: "skipped",
        code: "source_inactive",
        message: "Sales reports import source is inactive or not configured",
        details: { sourceKey: "loadSalesReports" },
      };
    }
    const branchId = Number(source?.branch?.id);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new SalesReportImportError(
        "INVALID_BRANCH",
        "Sales report import requires a valid branch",
      );
    }

    await fs.access(salesFile);
    const fileStat = await fs.stat(salesFile);
    const sourceRows = await readSourceFile(salesFile);
    const importDate = new Date().toISOString().slice(0, 10);
    const minAllowedReportDate = shiftIsoDate(importDate, -SALES_REPORT_RETENTION_DAYS);
    const snapshot = normalizeSalesReportSource(sourceRows, { minAllowedReportDate });

    connection = await pool.getConnection();
    if (!dryRun) {
      const [[lockRow]] = await connection.query(
        "SELECT GET_LOCK(?, 10) AS acquired",
        [`sales-report-import:${branchId}`],
      );
      if (Number(lockRow.acquired) !== 1) {
        throw new SalesReportImportError(
          "IMPORT_LOCK_TIMEOUT",
          "Another Sales Report import is already running",
        );
      }
      advisoryLockAcquired = true;
    }

    const lookupState = await loadLookupState(
      connection,
      branchId,
      snapshot.includedRows,
    );
    const plan = buildSalesReportImportPlan({ snapshot, ...lookupState });
    const planSummary = summarizePlan(plan);
    runLog.info("import plan built", {
      file: salesFile,
      sizeBytes: fileStat.size,
      branchId,
      ...plan.counters,
      diagnosticsCount: plan.diagnostics.length,
      hardConflictsCount: plan.hardConflicts.length,
    });

    if (plan.hasHardConflicts) {
      return {
        status: "failed",
        code: "import_plan_conflict",
        message: "Sales reports import plan contains hard conflicts",
        details: { file: salesFile, ...planSummary, keptSourceFile: true },
      };
    }
    if (dryRun) {
      return {
        status: "preview",
        code: "dry_run_completed",
        message: "Sales reports dry-run completed",
        details: {
          file: salesFile,
          branchId,
          ...planSummary,
          keptSourceFile: true,
        },
      };
    }

    await connection.beginTransaction();
    const [importResult] = await connection.query(
      `INSERT INTO report_imports (
         report_date, imported_at, rows_total, rows_inserted, branch_id
       ) VALUES (?, NOW(), ?, 0, ?)`,
      [importDate, snapshot.rowsTotal, branchId],
    );
    const importId = importResult.insertId;
    const execution = await executeSalesReportImportPlan(connection, plan, {
      importId,
      branchId,
    });
    await connection.query(
      "UPDATE report_imports SET rows_inserted = ? WHERE id = ?",
      [execution.insertedCount, importId],
    );

    let retentionDeletedRows = 0;
    if (!skipRetentionCleanup) {
      const [deleteResult] = await connection.query(
        `DELETE FROM sales_reports
         WHERE report_date < DATE_SUB(?, INTERVAL ? DAY) AND branch_id = ?`,
        [importDate, SALES_REPORT_RETENTION_DAYS, branchId],
      );
      retentionDeletedRows = deleteResult.affectedRows;
    }
    await connection.commit();

    if (source.deleteAfterSuccess) await fs.unlink(salesFile);
    const hasWarnings = plan.counters.unresolved > 0;
    const details = {
      file: salesFile,
      branchId,
      importId,
      ...planSummary,
      ...execution,
      retentionDeletedRows,
      keptSourceFile: !source.deleteAfterSuccess,
    };
    runLog.end("loader completed", details);
    return {
      status: hasWarnings ? "completed_with_warnings" : "completed",
      code: hasWarnings ? "partial_import" : "import_completed",
      message: hasWarnings
        ? "Sales reports imported with unresolved agents skipped"
        : "Sales reports imported successfully",
      details,
    };
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        runLog.error("transaction rollback failed", {
          errorMessage: rollbackError.message,
        });
      }
    }
    runLog.fail(error, "loader failed", { file: salesFile });
    return {
      status: "failed",
      code: error.code || "import_failed",
      message: error.message || "Sales reports import failed",
      details: {
        file: salesFile,
        ...(error.details || {}),
        keptSourceFile: true,
      },
    };
  } finally {
    if (connection) {
      if (advisoryLockAcquired) {
        try {
          await connection.query(
            "SELECT RELEASE_LOCK(?)",
            [`sales-report-import:${Number(source?.branch?.id)}`],
          );
        } catch (lockError) {
          runLog.error("advisory lock release failed", {
            errorMessage: lockError.message,
          });
        }
      }
      connection.release();
    }
  }
}

export async function previewSalesReportsFromSource(source) {
  return runSalesReportImport(
    { ...source, deleteAfterSuccess: false },
    { dryRun: true, skipRetentionCleanup: true },
  );
}

export async function loadSalesReportsFromSource(source, options = {}) {
  return runSalesReportImport(source, options);
}

export async function loadSalesReports() {
  const source = await getImportSourcePath("loadSalesReports", "SalesReport.json");
  return runSalesReportImport(source);
}
