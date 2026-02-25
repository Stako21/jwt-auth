import pool from "../db.cjs";
import {
  generatePdfBuffer,
  sendEmailWithPdf,
  sendRocketMessage,
} from "./notify.service.js";
import { getDocumentByIdService } from "./DocumentService.js";

export async function retryFailedNotifications() {
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

  for (const row of rows) {
    try {
      console.log("Retry notification:", row.id);

      const doc = await getDocumentByIdService(
        { role: 1 }, // admin context
        row.document_id
      );

      const pdfBuffer = await generatePdfBuffer(doc);

      if (row.channel === "EMAIL") {
        await sendEmailWithPdf(doc, pdfBuffer, [row.target]);
      }

      if (row.channel === "ROCKET") {
        await sendRocketMessage(doc, row.target, pdfBuffer);
      }

      // ✅ УСПЕХ
      await pool.query(
        `
        UPDATE notification_log
        SET status = 'SUCCESS',
            error_text = NULL
        WHERE id = ?
        `,
        [row.id]
      );

    } catch (err) {
      // ❌ ОШИБКА — увеличиваем attempt
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

      console.error("Retry failed:", err.message);
    }
  }
}
