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

export function createNotificationRetryService({
  db = pool, ensureAccess = ensureDocumentAccess, getDocument = getDocumentByIdService,
  generatePdf = generatePdfBuffer, sendPdfEmail = sendEmailWithPdf, sendPdfRocket = sendRocketMessage,
  sendStatusEmail = sendDocumentStatusEmail, sendStatusRocket = sendDocumentStatusRocket,
} = {}) {
  return async (user, documentId) => {
    // Перевірка доступу
    await ensureAccess(user, documentId);

    // Беремо тільки помилки
    const [logs] = await db.query(
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
    const doc = await getDocument(user, documentId);

    // Генеруємо PDF один раз
    const isTextEvent = (log) => ["STATUS_CHANGE", "TRO_CREATED"].includes(log.event_type);
    const needsPdf = logs.some((log) => !isTextEvent(log));
    const pdfBuffer = needsPdf ? await generatePdf(doc) : null;

    let successCount = 0;

    for (const log of logs) {
      try {
        const payload = log.event_payload ? JSON.parse(log.event_payload) : {};
        if (log.channel === "EMAIL") {
          if (isTextEvent(log)) {
            await sendStatusEmail(doc, payload.oldStatus, payload.newStatus, [log.target], payload);
          } else {
            await sendPdfEmail(doc, pdfBuffer, [log.target]);
          }
        }

        if (log.channel === "ROCKET") {
          if (isTextEvent(log)) {
            await sendStatusRocket(doc, payload.oldStatus, payload.newStatus, log.target, payload);
          } else {
            await sendPdfRocket(doc, log.target, pdfBuffer);
          }
        }

        // Успіх
        await db.query(
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
        await db.query(
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
  };
}

export const retryDocumentNotifications = createNotificationRetryService();
