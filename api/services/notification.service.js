import pool from "../db.cjs";
import { ensureDocumentAccess } from "./documentAccess.service.js";

export async function getDocumentNotificationsService(user, documentId) {
  // 🔒 Минимальная проверка доступа:
  // пользователь должен иметь доступ к самому документу
  // используем уже существующую проверку
  await ensureDocumentAccess(user, documentId);

  const [rows] = await pool.query(
    `
    SELECT
      channel,
      target,
      status,
      attempt,
      error_text,
      created_at
    FROM notification_log
    WHERE document_id = ?
    ORDER BY created_at DESC
    `,
    [documentId]
  );

  console.log("notification Log: ", rows);
  

  return rows;
}