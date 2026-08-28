import pool from "../db.cjs";
import {
  generatePdfBuffer,
  sendEmailWithPdf,
  sendRocketMessage,
  sendDocumentStatusEmail,
  sendDocumentStatusRocket,
} from "./notify.service.js";
import { getDocumentByIdService } from "./DocumentService.js";
import { createTaskLogger } from "./taskLogger.js";

const logger = createTaskLogger("retryFailedNotifications");

export async function retryFailedNotifications() {
  const runLog = logger.start("retry job started");

  const [rows] = await pool.query(
    `
    SELECT nl.*, d.branch_id
    FROM notification_log nl
    JOIN documents d ON d.id = nl.document_id
    WHERE nl.status = 'ERROR'
      AND nl.attempt < 3
    ORDER BY nl.created_at
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
        { role: 1, branchId: row.branch_id },
        row.document_id
      );
      rowLog.info("document loaded");

      const payload = row.event_payload ? JSON.parse(row.event_payload) : {};
      const pdfBuffer = row.event_type === "STATUS_CHANGE" ? null : await generatePdfBuffer(doc);
      if (pdfBuffer) rowLog.info("pdf generated", { sizeBytes: pdfBuffer.length });

      if (row.channel === "EMAIL") {
        if (row.event_type === "STATUS_CHANGE") {
          await sendDocumentStatusEmail(doc, payload.oldStatus, payload.newStatus, [row.target]);
        } else {
          await sendEmailWithPdf(doc, pdfBuffer, [row.target]);
        }
        rowLog.info("email notification sent");
      }

      if (row.channel === "ROCKET") {
        if (row.event_type === "STATUS_CHANGE") {
          await sendDocumentStatusRocket(doc, payload.oldStatus, payload.newStatus, row.target);
        } else {
          await sendRocketMessage(doc, row.target, pdfBuffer);
        }
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
