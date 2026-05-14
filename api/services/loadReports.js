import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";
import { getImportSourcePath } from "./appConfig.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createTaskLogger("loadSalesReports");

export async function loadSalesReports() {
  const source = await getImportSourcePath("loadSalesReports", "SalesReport.json");
  const salesFile = source?.filePath;
  const runLog = logger.start("loader started", { file: salesFile });
  let connection;

  try {
    if (!salesFile || !source?.isActive) {
      runLog.warn("import source is inactive or not configured, skipping", {
        sourceKey: "loadSalesReports",
      });
      return {
        status: "skipped",
        code: "source_inactive",
        message: "Sales reports import source is inactive or not configured",
        details: {
          sourceKey: "loadSalesReports",
        },
      };
    }

    const branch = source?.branch;
    const branchId = Number(branch.id);

    try {
      await fs.access(salesFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: salesFile });
      return {
        status: "skipped",
        code: "source_missing",
        message: "Sales reports source file not found",
        details: {
          file: salesFile,
        },
      };
    }

    const fileStat = await fs.stat(salesFile);
    runLog.info("source file found", {
      file: salesFile,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });

    let raw = await fs.readFile(salesFile, "utf-8");
    runLog.info("source file read", { rawLength: raw.length });
    raw = raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
    raw = raw.replace(/,\s*(?=[}\]])/g, "");

    let reports;
    try {
      reports = JSON.parse(raw);
    } catch (error) {
      runLog.fail(error, "json parse failed", { rawPreview: raw.slice(0, 200) });
      return {
        status: "failed",
        code: "json_parse_failed",
        message: "Sales reports source JSON parse failed",
        details: {
          file: salesFile,
        },
      };
    }

    runLog.info("json parsed", {
      isArray: Array.isArray(reports),
      recordsCount: Array.isArray(reports) ? reports.length : null,
    });

    if (!Array.isArray(reports) || reports.length === 0) {
      runLog.warn("source file is empty or invalid array, skipping");
      return {
        status: "skipped",
        code: "empty_source",
        message: "Sales reports source file is empty or invalid",
        details: {
          file: salesFile,
        },
      };
    }

    const validReports = [];
    let skippedInvalidRows = 0;

    for (const report of reports) {
      const normalized = normalizeReportRow(report);
      if (!normalized) {
        skippedInvalidRows += 1;
        runLog.warn("sales report row skipped: invalid data", {
          documentNumber: report?.number,
          loginAgent: report?.loginAgent,
          salesAgent: report?.salesAgent,
          reportDate: report?.date,
        });
        continue;
      }

      validReports.push(normalized);
    }

    if (validReports.length === 0) {
      runLog.warn("no valid sales report rows remained after precheck, skipping import", {
        recordsCount: reports.length,
        skippedInvalidRows,
      });
      return {
        status: "skipped",
        code: "no_valid_rows",
        message: "Sales reports import has no valid rows after precheck",
        details: {
          recordsCount: reports.length,
          skippedInvalidRows,
        },
      };
    }

    const reportDate = new Date().toISOString().split("T")[0];
    runLog.info("import metadata prepared", {
      reportDate,
      branchId,
      branchSlug: branch.slug,
      recordsCount: validReports.length,
      skippedInvalidRows,
    });

    connection = await pool.getConnection();
    runLog.info("db connection acquired");

    await connection.beginTransaction();
    runLog.info("transaction started");

    const [importRes] = await connection.query(
      `
      INSERT INTO report_imports (report_date, imported_at, rows_total, branch_id)
      VALUES (?, NOW(), ?, ?)
      `,
      [reportDate, validReports.length, branchId],
    );
    const importId = importRes.insertId;
    runLog.info("report_imports row created", { importId });

    const incomingKeys = new Set();

    let insertedCount = 0;
    let updatedCount = 0;
    let movedCount = 0;
    let missingUserCount = 0;

    for (const report of validReports) {
      try {
        const user = await resolveReportUser(connection, report, branchId);
        const userId = user?.id ?? null;
        const resolvedLoginAgent = user?.loginAgent || report.loginAgent || report.salesAgent;
        const resolvedSalesAgentName = report.salesAgent || user?.salesAgentName || null;

        if (!userId) {
          missingUserCount += 1;
          runLog.warn("user not found for sales report row", {
            documentNumber: report.number,
            loginAgent: report.loginAgent || null,
            salesAgent: report.salesAgent || null,
          });
        }

        incomingKeys.add(`${report.number}||${resolvedLoginAgent}`);

        const [[existing]] = await connection.query(
          `
          SELECT *
          FROM sales_reports
          WHERE document_number = ?
            AND login_agent = ?
            AND branch_id = ?
          ORDER BY
            CASE status
              WHEN 'ACTIVE' THEN 1
              WHEN 'MOVED' THEN 2
              ELSE 3
            END,
            created_at DESC
          LIMIT 1
          `,
          [report.number, resolvedLoginAgent, branchId],
        );

        if (!existing) {
          await connection.query(
            `
            INSERT INTO sales_reports (
              report_date,
              document_number,
              document_date,
              login_agent,
              user_id,
              sales_agent_name,
              amount,
              point_of_sale,
              customer,
              comment,
              form2,
              status,
              import_id,
              branch_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
            `,
            [
              report.docDate,
              report.number,
              report.originalDate,
              resolvedLoginAgent,
              userId,
              resolvedSalesAgentName,
              report.amount,
              report.pointOfSale,
              report.customer,
              report.comment,
              report.form2 ? 1 : 0,
              importId,
              branchId,
            ],
          );
          insertedCount += 1;
          continue;
        }

        const existingDate = existing.document_date?.toISOString().slice(0, 10);

        if (existingDate === report.docDate) {
          await connection.query(
            `
            UPDATE sales_reports
            SET status = 'ACTIVE',
                change_comment = NULL,
                amount = ?,
                login_agent = ?,
                user_id = ?,
                sales_agent_name = ?,
                import_id = ?
            WHERE id = ?
            `,
            [
              report.amount,
              resolvedLoginAgent,
              userId,
              resolvedSalesAgentName,
              importId,
              existing.id,
            ],
          );
          updatedCount += 1;
          continue;
        }

        const moveComment = `Перенесено з ${existingDate} на ${report.docDate}, сума ${report.amount}`;

        await connection.query(
          `
          UPDATE sales_reports
          SET status = 'MOVED',
              amount = 0,
              change_comment = ?
          WHERE id = ?
          `,
          [moveComment, existing.id],
        );

        const [newRes] = await connection.query(
          `
          INSERT INTO sales_reports (
            report_date,
            document_number,
            document_date,
            login_agent,
            user_id,
            sales_agent_name,
            amount,
            point_of_sale,
            customer,
            comment,
            form2,
            status,
            import_id,
            branch_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
          `,
          [
            report.docDate,
            report.number,
            report.originalDate,
            resolvedLoginAgent,
            userId,
            resolvedSalesAgentName,
            report.amount,
            report.pointOfSale,
            report.customer,
            report.comment,
            report.form2 ? 1 : 0,
            importId,
            branchId,
          ],
        );

        await connection.query(
          `
          UPDATE sales_reports
          SET replaced_by_id = ?
          WHERE id = ?
          `,
          [newRes.insertId, existing.id],
        );

        movedCount += 1;
      } catch (rowError) {
        runLog.error("sales report row processing failed", {
          documentNumber: report.number,
          loginAgent: report.loginAgent,
          errorMessage: rowError.message,
          errorStack: rowError.stack,
        });
        throw rowError;
      }
    }

    runLog.info("incoming keys prepared", { incomingKeys: incomingKeys.size });

    runLog.info("rows processed", {
      processedCount: validReports.length,
      insertedCount,
      updatedCount,
      movedCount,
      missingUserCount,
      skippedInvalidRows,
    });

    const [cancelledRes] = await connection.query(
      `
      UPDATE sales_reports
      SET status = 'CANCELLED',
          change_comment = 'Реалізація відмінена (відсутня в останньому звіті)'
      WHERE status = 'ACTIVE'
        AND branch_id = ?
        AND report_date >= DATE_SUB(?, INTERVAL 5 DAY)
        AND CONCAT(document_number, '||', login_agent) NOT IN (?)
      `,
      [branchId, reportDate, Array.from(incomingKeys)],
    );
    runLog.info("missing active rows cancelled", {
      affectedRows: cancelledRes.affectedRows,
    });

    const [delRes] = await connection.query(
      `
      DELETE
        FROM sales_reports
      WHERE report_date < DATE_SUB(?, INTERVAL 5 DAY)
        AND branch_id = ?
      `,
      [reportDate, branchId],
    );
    runLog.info("old rows cleanup completed", {
      reportDate,
      deletedRows: delRes.affectedRows,
    });

    await connection.commit();
    runLog.info("transaction committed", { importId });

    const hasUnresolvedRows = skippedInvalidRows > 0;

    if (!source.deleteAfterSuccess) {
      runLog.info("source file kept after successful import", { file: salesFile });
    } else if (hasUnresolvedRows) {
      runLog.warn("source file kept after partial import", {
        file: salesFile,
        skippedInvalidRows,
      });
    } else {
      await fs.unlink(salesFile);
      runLog.info("source file removed", { file: salesFile });
    }

    const result = {
      status: hasUnresolvedRows ? "completed_with_warnings" : "completed",
      code: hasUnresolvedRows ? "partial_import" : "import_completed",
      message: hasUnresolvedRows
        ? "Sales reports imported with warnings"
        : "Sales reports imported successfully",
      details: {
        processedCount: validReports.length,
        insertedCount,
        updatedCount,
        movedCount,
        missingUserCount,
        skippedInvalidRows,
        keptSourceFile: !source.deleteAfterSuccess || hasUnresolvedRows,
      },
    };

    runLog.end("loader completed", {
      importId,
      recordsCount: validReports.length,
      skippedInvalidRows,
      keptSourceFile: !source.deleteAfterSuccess || hasUnresolvedRows,
    });
    return result;
  } catch (error) {
    try {
      if (connection) {
        await connection.rollback();
        runLog.info("transaction rolled back");
      }
    } catch (rollbackError) {
      runLog.error("transaction rollback failed", {
        errorMessage: rollbackError.message,
        errorStack: rollbackError.stack,
      });
    }

    runLog.fail(error, "loader failed", { file: salesFile });
    return {
      status: "failed",
      code: "import_failed",
      message: "Sales reports import failed",
      details: {
        file: salesFile,
        errorMessage: error.message,
      },
    };
  } finally {
    if (connection) {
      connection.release();
      logger.info("db connection released");
    }
  }
}

function normalizeReportRow(report) {
  if (!report || !report.number || !report.date) {
    return null;
  }

  const number = String(report.number).trim();
  const loginAgent = String(report.loginAgent || "").trim();
  const salesAgent = String(report.salesAgent || "").trim();
  if (!number || (!loginAgent && !salesAgent)) {
    return null;
  }

  const parsedDate = new Date(report.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    number,
    loginAgent,
    originalDate: report.date,
    docDate: parsedDate.toISOString().slice(0, 10),
    salesAgent,
    amount: report.amount,
    pointOfSale: report.pointOfSale,
    customer: report.customer,
    comment: report.comment,
    form2: Boolean(report.form2),
  };
}

async function resolveReportUser(connection, report, branchId) {
  if (report.loginAgent) {
    const [[userByLogin]] = await connection.query(
      `
      SELECT
        u.id,
        u.NAME AS loginAgent,
        COALESCE(NULLIF(u.user_name, ''), NULLIF(sa.full_name, ''), u.NAME) AS salesAgentName
      FROM users u
      LEFT JOIN sales_agents sa
        ON sa.user_id = u.id
       AND sa.branch_id = u.branch_id
      WHERE u.NAME = ?
        AND u.is_active = 1
        AND u.branch_id = ?
      LIMIT 1
      `,
      [report.loginAgent, branchId],
    );

    if (userByLogin) {
      return userByLogin;
    }
  }

  if (!report.salesAgent) {
    return null;
  }

  const [[userByName]] = await connection.query(
    `
    SELECT
      u.id,
      u.NAME AS loginAgent,
      COALESCE(NULLIF(sa.full_name, ''), NULLIF(u.user_name, ''), u.NAME) AS salesAgentName
    FROM users u
    LEFT JOIN sales_agents sa
      ON sa.user_id = u.id
     AND sa.branch_id = u.branch_id
    WHERE u.is_active = 1
      AND u.branch_id = ?
      AND (
        u.user_name = ?
        OR sa.full_name = ?
      )
    ORDER BY
      CASE
        WHEN sa.full_name = ? THEN 1
        WHEN u.user_name = ? THEN 2
        ELSE 3
      END,
      u.id
    LIMIT 1
    `,
    [
      branchId,
      report.salesAgent,
      report.salesAgent,
      report.salesAgent,
      report.salesAgent,
    ],
  );

  return userByName || null;
}
