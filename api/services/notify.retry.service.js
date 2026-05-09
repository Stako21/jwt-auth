import pool from "../db.cjs";
import {
  generatePdfBuffer,
  sendEmailWithPdf,
  sendRocketMessage,
} from "./notify.service.js";
import { getDocumentByIdService } from "./DocumentService.js";
import { createTaskLogger } from "./taskLogger.js";

const logger = createTaskLogger("retryFailedNotifications");

export async function retryFailedNotifications() {
  const runLog = logger.start("retry job started");

  const [rows] = await pool.query(
    `
    SELECT *
    FROM notification_log
    WHERE status = 'ERROR'
      AND attempt < 3
    ORDER BY created_at
    LIMIT 10
    `
  );

  runLog.info("failed notifications loaded", { recordsCount: rows.length });

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const rowLog = logger.child(`row:${row.id}`).start("retry started", {
      documentId: row.document_id,
      channel: row.channel,
      target: row.target,
      attempt: row.attempt,
    });

    try {
      const doc = await getDocumentByIdService(
        { role: 1 },
        row.document_id
      );
      rowLog.info("document loaded");

      const pdfBuffer = await generatePdfBuffer(doc);
      rowLog.info("pdf generated", { sizeBytes: pdfBuffer.length });

      if (row.channel === "EMAIL") {
        await sendEmailWithPdf(doc, pdfBuffer, [row.target]);
        rowLog.info("email notification sent");
      }

      if (row.channel === "ROCKET") {
        await sendRocketMessage(doc, row.target, pdfBuffer);
        rowLog.info("rocket notification sent");
      }

      await pool.query(
        `
        UPDATE notification_log
        SET status = 'SUCCESS',
            error_text = NULL
        WHERE id = ?
        `,
        [row.id]
      );

      successCount += 1;
      rowLog.end("retry completed");
    } catch (err) {
      errorCount += 1;

      await pool.query(
        `
        UPDATE notification_log
        SET
          attempt = attempt + 1,
          error_text = ?
        WHERE id = ?
        `,
        [err.message, row.id]
      );

      rowLog.fail(err, "retry failed");
    }
  }

  runLog.end("retry job completed", {
    recordsCount: rows.length,
    successCount,
    errorCount,
  });

  return {
    status: errorCount > 0 ? "completed_with_warnings" : "completed",
    code: errorCount > 0 ? "partial_retry" : "retry_completed",
    message:
      errorCount > 0
        ? "Notification retry finished with warnings"
        : "Notification retry finished successfully",
    details: {
      recordsCount: rows.length,
      successCount,
      errorCount,
    },
  };
}
