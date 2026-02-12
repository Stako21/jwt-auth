import pool from "../db.cjs";

/**
 * Проверяет, имеет ли user доступ к документу
 * Возвращает документ (минимальный набор полей), если доступ есть
 * Бросает Error("FORBIDDEN") или Error("NOT_FOUND")
 */
export async function ensureDocumentAccess(user, documentId) {
  const [rows] = await pool.query(
    `
    SELECT
      d.id,
      d.author_user_id,
      d.city
    FROM documents d
    WHERE d.id = ?
    `,
    [documentId]
  );

  if (!rows.length) {
    throw new Error("NOT_FOUND");
  }

  const doc = rows[0];

  // 1️⃣ Admin / Director — всегда можно
  if (user.role === 1 || user.role === 2) {
    return doc;
  }

  // 2️⃣ TA — только свои документы
  if (user.role === 5) {
    if (doc.author_user_id !== user.id) {
      throw new Error("FORBIDDEN");
    }
    return doc;
  }

  // 3️⃣ Accountant / Warehouse — только регион
  if ([6, 7].includes(user.role)) {
    if (doc.city !== user.city) {
      throw new Error("FORBIDDEN");
    }
    return doc;
  }

  // 4️⃣ SV / NTO — иерархия
  if ([3, 4].includes(user.role)) {
    const [subs] = await pool.query(
      `
      WITH RECURSIVE subordinates AS (
        SELECT child_user_id
        FROM user_hierarchy
        WHERE parent_user_id = ?

        UNION ALL

        SELECT uh.child_user_id
        FROM user_hierarchy uh
        JOIN subordinates s
          ON s.child_user_id = uh.parent_user_id
      )
      SELECT child_user_id FROM subordinates
      `,
      [user.id]
    );

    const allowedIds = subs.map(r => r.child_user_id);
    allowedIds.push(user.id);

    if (!allowedIds.includes(doc.author_user_id)) {
      throw new Error("FORBIDDEN");
    }

    return doc;
  }

  throw new Error("FORBIDDEN");
}