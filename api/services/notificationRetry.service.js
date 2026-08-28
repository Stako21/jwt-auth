import pool from "../db.cjs";
import { ensureDocumentAccess } from "./documentAccess.service.js";
import { getDocumentByIdService } from "./DocumentService.js";
import {
  generatePdfBuffer,
  sendEmailWithPdf,
  sendRocketMessage,
  sendDocumentStatusEmail,
  sendDocumentStatusRocket,
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
  const needsPdf = logs.some((log) => log.event_type !== "STATUS_CHANGE");
  const pdfBuffer = needsPdf ? await generatePdfBuffer(doc) : null;

  let successCount = 0;

  for (const log of logs) {
    try {
      const payload = log.event_payload ? JSON.parse(log.event_payload) : {};
      if (log.channel === "EMAIL") {
        if (log.event_type === "STATUS_CHANGE") {
          await sendDocumentStatusEmail(doc, payload.oldStatus, payload.newStatus, [log.target]);
        } else {
          await sendEmailWithPdf(doc, pdfBuffer, [log.target]);
        }
      }

      if (log.channel === "ROCKET") {
        if (log.event_type === "STATUS_CHANGE") {
          await sendDocumentStatusRocket(doc, payload.oldStatus, payload.newStatus, log.target);
        } else {
          await sendRocketMessage(doc, log.target, pdfBuffer);
        }
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
