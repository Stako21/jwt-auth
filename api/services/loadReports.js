import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const salesFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "SalesReport.json"
);

const logger = createTaskLogger("loadSalesReports");

export async function loadSalesReports() {
  const runLog = logger.start("loader started", { file: salesFile });
  const connection = await pool.getConnection();

  try {
    runLog.info("db connection acquired");

    try {
      await fs.access(salesFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: salesFile });
      return;
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

    const reports = JSON.parse(raw);
    runLog.info("json parsed", {
      isArray: Array.isArray(reports),
      recordsCount: Array.isArray(reports) ? reports.length : null,
    });
    if (!Array.isArray(reports) || reports.length === 0) {
      runLog.warn("source file is empty or invalid array, skipping");
      return;
    }

    const reportDate = new Date().toISOString().split("T")[0];
    runLog.info("import metadata prepared", {
      reportDate,
      recordsCount: reports.length,
    });

    await connection.beginTransaction();
    runLog.info("transaction started");

    const [importRes] = await connection.query(
      `
      INSERT INTO report_imports (report_date, imported_at, rows_total)
      VALUES (?, NOW(), ?)
      `,
      [reportDate, reports.length]
    );
    const importId = importRes.insertId;
    runLog.info("report_imports row created", { importId });

    const incomingKeys = new Set();
    for (const report of reports) {
      incomingKeys.add(`${report.number}||${report.loginAgent}`);
    }
    runLog.info("incoming keys prepared", { incomingKeys: incomingKeys.size });

    let insertedCount = 0;
    let updatedCount = 0;
    let movedCount = 0;
    let missingUserCount = 0;

    for (const report of reports) {
      const docDate = report.date.split("T")[0];

      const [[user]] = await connection.query(
        `SELECT id FROM users WHERE NAME = ? AND is_active = 1`,
        [report.loginAgent]
      );
      const userId = user?.id ?? null;

      if (!userId) {
        missingUserCount += 1;
        runLog.warn("user not found for sales report row", {
          documentNumber: report.number,
          loginAgent: report.loginAgent,
        });
      }

      const [[existing]] = await connection.query(
        `
        SELECT *
        FROM sales_reports
        WHERE document_number = ?
          AND login_agent = ?
        ORDER BY
          CASE status
            WHEN 'ACTIVE' THEN 1
            WHEN 'MOVED' THEN 2
            ELSE 3
          END,
          created_at DESC
        LIMIT 1
        `,
        [report.number, report.loginAgent]
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
            import_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
          `,
          [
            docDate,
            report.number,
            report.date,
            report.loginAgent,
            userId,
            report.salesAgent,
            report.amount,
            report.pointOfSale,
            report.customer,
            report.comment,
            report.form2 ? 1 : 0,
            importId,
          ]
        );
        insertedCount += 1;
        continue;
      }

      const existingDate = existing.document_date?.toISOString().slice(0, 10);

      if (existingDate === docDate) {
        await connection.query(
          `
          UPDATE sales_reports
          SET status = 'ACTIVE',
              change_comment = NULL,
              amount = ?,
              import_id = ?
          WHERE id = ?
          `,
          [report.amount, importId, existing.id]
        );
        updatedCount += 1;
        continue;
      }

      const moveComment = `Перенесено з ${existingDate} на ${docDate}, сума ${report.amount}`;

      await connection.query(
        `
        UPDATE sales_reports
        SET status = 'MOVED',
            amount = 0,
            change_comment = ?
        WHERE id = ?
        `,
        [moveComment, existing.id]
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
          import_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
        `,
        [
          docDate,
          report.number,
          report.date,
          report.loginAgent,
          userId,
          report.salesAgent,
          report.amount,
          report.pointOfSale,
          report.customer,
          report.comment,
          report.form2 ? 1 : 0,
          importId,
        ]
      );

      await connection.query(
        `
        UPDATE sales_reports
        SET replaced_by_id = ?
        WHERE id = ?
        `,
        [newRes.insertId, existing.id]
      );

      movedCount += 1;
    }

    runLog.info("rows processed", {
      processedCount: reports.length,
      insertedCount,
      updatedCount,
      movedCount,
      missingUserCount,
    });

    const [cancelledRes] = await connection.query(
      `
      UPDATE sales_reports
      SET status = 'CANCELLED',
          change_comment = 'Реалізація відмінена (відсутня в останньому звіті)'
      WHERE status = 'ACTIVE'
        AND report_date >= DATE_SUB(?, INTERVAL 5 DAY)
        AND CONCAT(document_number, '||', login_agent) NOT IN (?)
      `,
      [reportDate, Array.from(incomingKeys)]
    );
    runLog.info("missing active rows cancelled", {
      affectedRows: cancelledRes.affectedRows,
    });

    const [delRes] = await connection.query(
      `
      DELETE
        FROM sales_reports
      WHERE report_date < DATE_SUB(?, INTERVAL 5 DAY)
      `,
      [reportDate]
    );
    runLog.info("old rows cleanup completed", {
      reportDate,
      deletedRows: delRes.affectedRows,
    });

    await connection.commit();
    runLog.info("transaction committed", { importId });

    await fs.unlink(salesFile);
    runLog.info("source file removed", { file: salesFile });

    runLog.end("loader completed", {
      importId,
      recordsCount: reports.length,
    });
  } catch (err) {
    try {
      await connection.rollback();
      runLog.info("transaction rolled back");
    } catch (rollbackError) {
      runLog.error("transaction rollback failed", {
        errorMessage: rollbackError.message,
        errorStack: rollbackError.stack,
      });
    }

    runLog.fail(err, "loader failed", { file: salesFile });
  } finally {
    connection.release();
    logger.info("db connection released");
  }
}
