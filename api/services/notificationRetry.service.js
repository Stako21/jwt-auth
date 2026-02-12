import pool from "../db.cjs";
import fs from "fs";
import { ensureDocumentAccess } from "./documentAccess.service.js";
import { getDocumentByIdService } from "./DocumentService.js";
import { sendEmailWithPdf, sendRocketMessage } from "./notify.service.js";
import { generatePdfTemp } from "./notify.service.js";

export async function retryDocumentNotifications(user, documentId) {
  // 🔒 Проверка доступа
  await ensureDocumentAccess(user, documentId);

  // ❌ Берём только ошибки
  const [logs] = await pool.query(
    `
    SELECT *
    FROM notification_log
    WHERE document_id = ?
      AND status = 'ERROR'
      AND attempt < 3
    ORDER BY created_at
    `,
    [documentId]
  );

  if (!logs.length) {
    return { retried: 0 };
  }

  // 📄 Загружаем полный документ
  const doc = await getDocumentByIdService(user, documentId);

  // 📎 Генерируем PDF ОДИН раз
  const pdfPath = await generatePdfTemp(doc);

  let successCount = 0;

  try {
    for (const log of logs) {
      try {
        if (log.channel === "EMAIL") {
          await sendEmailWithPdf(doc, pdfPath, [log.target]);
        }

        if (log.channel === "ROCKET") {
          await sendRocketMessage(doc, log.target, pdfPath);
        }

        // ✅ успех
        await pool.query(
          `
          UPDATE notification_log
          SET status = 'SUCCESS',
              error_text = NULL
          WHERE id = ?
          `,
          [log.id]
        );

        successCount++;
      } catch (err) {
        // ❌ ошибка → увеличиваем attempt
        await pool.query(
          `
          UPDATE notification_log
          SET attempt = attempt + 1,
              error_text = ?
          WHERE id = ?
          `,
          [err.message, log.id]
        );
      }
    }
  } finally {
    fs.unlinkSync(pdfPath);
  }

  return { retried: successCount };
}