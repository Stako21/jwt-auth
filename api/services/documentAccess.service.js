import pool from "../db.cjs";
import { getUserBranchId, getUserVisibleBranchIds } from "./appConfig.service.js";

async function getUserVisibleCityIds(user) {
  const cityIds = new Set([Number(user.city)]);
  const [rows] = await pool.query(
    `
    SELECT city_id
    FROM user_city_access
    WHERE user_id = ?
    `,
    [user.id],
  );

  for (const row of rows) {
    cityIds.add(Number(row.city_id));
  }

  return Array.from(cityIds).filter(Boolean);
}

/**
 * Проверяет, имеет ли user доступ к документу
 * Возвращает документ (минимальный набор полей), если доступ есть
 * Бросает Error("FORBIDDEN") или Error("NOT_FOUND")
 */
export async function ensureDocumentAccess(user, documentId) {
  const branchIds =
    user.role === 1 || user.role === 2
      ? await getUserVisibleBranchIds(user)
      : [getUserBranchId(user)];
  const [rows] = await pool.query(
    `
    SELECT
      d.id,
      d.author_user_id,
      d.city,
      d.branch_id
    FROM documents d
    WHERE d.id = ?
      AND d.branch_id IN (${branchIds.map(() => "?").join(", ")})
    `,
    [documentId, ...branchIds],
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
    const cityIds = await getUserVisibleCityIds(user);
    if (!cityIds.includes(Number(doc.city))) {
      throw new Error("FORBIDDEN");
    }
    return doc;
  }

  // 4️⃣ SV — только свой регион + иерархия
  if (user.role === 4) {
    if (doc.city !== user.city) {
      throw new Error("FORBIDDEN");
    }

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

  // 5️⃣ NTO — иерархия + TA без руководителя (любой регион)
  if (user.role === 3) {
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

    if (allowedIds.includes(doc.author_user_id)) {
      return doc;
    }

    const [[orphanTa]] = await pool.query(
      `
      SELECT 1
      FROM users u
      LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
      WHERE u.id = ?
        AND u.role = 5
        AND u.branch_id = ?
        AND h.parent_user_id IS NULL
      `,
      [doc.author_user_id, doc.branch_id],
    );

    if (!orphanTa) {
      throw new Error("FORBIDDEN");
    }

    return doc;
  }

  throw new Error("FORBIDDEN");
}
