import pool from "../db.cjs";
import { sendEmailWithPdf, sendRocketMessage } from "./notify.service.js";
import { getDocumentByIdService } from "./DocumentService.js";
import fs from "fs";

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

      const pdfPath = await generatePdfTemp(doc);

      if (row.channel === "EMAIL") {
        await sendEmailWithPdf(doc, pdfPath, [row.target]);
      }

      if (row.channel === "ROCKET") {
        await sendRocketMessage(doc, row.target, pdfPath);
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

      fs.unlinkSync(pdfPath);
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