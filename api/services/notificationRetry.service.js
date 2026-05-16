import pool from "../db.cjs";
import { ensureDocumentAccess } from "./documentAccess.service.js";
import { getDocumentByIdService } from "./DocumentService.js";
import {
  generatePdfBuffer,
  sendEmailWithPdf,
  sendRocketMessage,
} from "./notify.service.js";

export async function retryDocumentNotifications(user, documentId) {
  // Перевірка доступу
  await ensureDocumentAccess(user, documentId);

  // Беремо тільки помилки
  const [logs] = await pool.query(
    `
    SELECT *
    FROM notification_log
    WHERE document_id = ?
      AND status = 'ERROR'
      AND attempt < 3
    ORDER BY created_at
    `,
    [documentId],
  );

  if (!logs.length) {
    return { retried: 0 };
  }

  // Завантажуємо повний документ
  const doc = await getDocumentByIdService(user, documentId);

  // Генеруємо PDF один раз
  const pdfBuffer = await generatePdfBuffer(doc);

  let successCount = 0;

  for (const log of logs) {
    try {
      if (log.channel === "EMAIL") {
        await sendEmailWithPdf(doc, pdfBuffer, [log.target]);
      }

      if (log.channel === "ROCKET") {
        await sendRocketMessage(doc, log.target, pdfBuffer);
      }

      // Успіх
      await pool.query(
        `
        UPDATE notification_log
        SET status = 'SUCCESS',
            error_text = NULL
        WHERE id = ?
        `,
        [log.id],
      );

      successCount++;
    } catch (err) {
      // Помилка: збільшуємо attempt
      await pool.query(
        `
        UPDATE notification_log
        SET attempt = attempt + 1,
            error_text = ?
        WHERE id = ?
        `,
        [err.message, log.id],
      );
    }
  }

  return { retried: successCount };
}
