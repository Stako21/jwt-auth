import pool from "../db.cjs";
import { notifyDocumentSigned } from "./notify.service.js";

/**
 * user: { id, role, city }
 * payload: тело запроса
 */
export async function createDocumentService(user, payload) {

  const { documentType, documentDate, tradePointId, reason, comment, items } =
    payload;

  if (!documentType || !documentDate || !tradePointId || !items?.length) {
    throw new Error("Некорректные данные документа");
  }

  // ===== ВАЛИДАЦИЯ ПО ТИПУ ДОКУМЕНТА =====

  if (documentType === "EXCHANGE") {
    const takeItems = items.filter((i) => i.operation === "TAKE");
    const giveItems = items.filter((i) => i.operation === "GIVE");

    if (takeItems.length === 0 || giveItems.length === 0) {
      throw new Error("Для обміну обовʼязково потрібні TAKE і GIVE");
    }

    const takeQty = takeItems.reduce(
      (sum, i) => sum + Number(i.quantity || 0),
      0,
    );

    const giveQty = giveItems.reduce(
      (sum, i) => sum + Number(i.quantity || 0),
      0,
    );

    if (takeQty !== giveQty) {
      throw new Error(
        `Кількість не співпадає: забрали ${takeQty}, видали ${giveQty}`,
      );
    }
  }

  if (documentType === "RETURN") {
    if (items.some((i) => i.operation === "GIVE")) {
      throw new Error("Для повернення дозволено тільки TAKE");
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /** 1️⃣ Получаем контрагента */
    const [[tp]] = await connection.query(
      `
      SELECT contractor_id
      FROM trade_points
      WHERE id = ? AND is_active = 1
      `,
      [tradePointId],
    );

    if (!tp) {
      throw new Error("Торговая точка не найдена или неактивна");
    }

    /** 2️⃣ Генерация номера */
    const city = user.city;

    const [[seq]] = await connection.query(
      `
      SELECT last_number
      FROM document_sequences
      WHERE city = ?
      FOR UPDATE
      `,
      [city],
    );

    let nextNumber = 1;

    if (!seq) {
      await connection.query(
        `INSERT INTO document_sequences (city, last_number) VALUES (?, 1)`,
        [city],
      );
    } else {
      nextNumber = seq.last_number + 1;
      await connection.query(
        `UPDATE document_sequences SET last_number = ? WHERE city = ?`,
        [nextNumber, city],
      );
    }

    const prefixMap = {
      1: "ЗП",
      2: "ДП",
      3: "КР",
    };

    const prefix = prefixMap[city] ?? "XX";
    const documentNumber = `${prefix}${String(nextNumber).padStart(6, "0")}`;

    /** 3️⃣ Создаём документ */
    const [docRes] = await connection.query(
      `
      INSERT INTO documents (
        document_type,
        document_number,
        document_sequence,
        city,
        document_date,
        trade_point_id,
        contractor_id,
        author_user_id,
        status,
        reason,
        comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?)
      `,
      [
        documentType,
        documentNumber,
        nextNumber,
        city,
        documentDate,
        tradePointId,
        tp.contractor_id,
        user.id,
        reason,
        comment ?? null,
      ],
    );

    const documentId = docRes.insertId;

    /** 4️⃣ Табличная часть */
    for (const item of items) {
      const {
        productId,
        unit,
        quantity,
        manufactureDate,
        expiryDate,
        operation,
      } = item;

      if (!productId || quantity <= 0 || !operation) {
        throw new Error("Некорректная строка товара");
      }

      if (!["TAKE", "GIVE"].includes(operation)) {
        throw new Error("Неверное значение operation");
      }

      const [[product]] = await connection.query(
        `
        SELECT p.name, g.id AS group_id, g.name AS group_name
        FROM products p
        JOIN product_groups g ON g.id = p.group_id
        WHERE p.id = ? AND p.is_active = 1
        `,
        [productId],
      );

      if (!product) {
        throw new Error(`Товар ${productId} не найден`);
      }

      await connection.query(
        `
        INSERT INTO document_items (
          document_id,
          product_id,
          product_group_id,
          product_name_snapshot,
          product_group_snapshot,
          unit,
          quantity,
          manufacture_date,
          expiry_date,
          operation
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          documentId,
          productId,
          product.group_id,
          product.name,
          product.group_name,
          unit,
          quantity,
          manufactureDate,
          expiryDate,
          operation,
        ],
      );
    }

    /** 5️⃣ История */
    await connection.query(
      `
      INSERT INTO document_history (
        document_id,
        user_id,
        action,
        old_status,
        new_status
      )
      VALUES (?, ?, 'CREATE', NULL, 'NEW')
      `,
      [documentId, user.id],
    );

    await connection.commit();

    return {
      id: documentId,
      documentNumber,
      status: "NEW",
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function checkHierarchy(conn, parentId, authorId) {
  const [rows] = await conn.query(
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
    [parentId],
  );

  const allowed = rows.map((r) => r.child_user_id);
  allowed.push(parentId);

  if (!allowed.includes(authorId)) {
    throw new Error("Нет прав подписи документа этого пользователя");
  }

  return true;
}

async function checkDirectSubordinate(conn, parentId, authorId) {
  const [[row]] = await conn.query(
    `
    SELECT 1
    FROM user_hierarchy
    WHERE parent_user_id = ?
      AND child_user_id = ?
    `,
    [parentId, authorId],
  );

  return !!row;
}

async function isTaWithoutSupervisor(conn, authorId) {
  const [[row]] = await conn.query(
    `
    SELECT 1
    FROM users u
    LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
    WHERE u.id = ?
      AND u.role = 5
      AND h.parent_user_id IS NULL
    `,
    [authorId],
  );

  return !!row;
}

async function canNtoAccessAuthor(conn, ntoUserId, authorId) {
  const [rows] = await conn.query(
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
    [ntoUserId],
  );

  const allowedIds = rows.map((r) => r.child_user_id);
  allowedIds.push(ntoUserId);

  if (allowedIds.includes(authorId)) {
    return true;
  }

  return isTaWithoutSupervisor(conn, authorId);
}

async function checkCanSignDocument(conn, user, documentId) {
  const [[doc]] = await conn.query(
    `
    SELECT
      d.id,
      d.status,
      d.city,
      d.author_user_id
    FROM documents d
    WHERE d.id = ?
    `,
    [documentId],
  );

  if (!doc) {
    throw new Error("NOT_FOUND");
  }

  if (doc.status !== "PREPARED") {
    throw new Error("Нельзя подписать документ в этом статусе");
  }

  // Admin / Director
  if (user.role === 1 || user.role === 2) {
    return doc;
  }

  // NTO — иерархия + TA без руководителя
  if (user.role === 3) {
    const allowed = await canNtoAccessAuthor(conn, user.id, doc.author_user_id);
    if (!allowed) {
      throw new Error("NTO не может подписать этот документ");
    }
    return doc;
  }

  throw new Error("Нет прав подписи");
}

async function checkCanChangeStatus(conn, user, documentId, nextStatus) {
  const [[doc]] = await conn.query(
    `
    SELECT
      d.id,
      d.status,
      d.city,
      d.author_user_id
    FROM documents d
    WHERE d.id = ?
    `,
    [documentId],
  );

  if (!doc) {
    throw new Error("NOT_FOUND");
  }

  if (["REJECTED", "SIGNED"].includes(doc.status)) {
    throw new Error("Нельзя изменить статус финального документа");
  }

  // Автор может отклонить ошибочный документ
  if (
    nextStatus === "REJECTED" &&
    doc.author_user_id === user.id &&
    ["NEW", "REVISION", "PREPARED"].includes(doc.status)
  ) {
    return doc;
  }

  // SV: NEW/REVISION -> PREPARED
  if (nextStatus === "PREPARED" && user.role === 4) {
    if (!["NEW", "REVISION"].includes(doc.status)) {
      throw new Error("SV может одобрять только NEW/REVISION");
    }
    if (doc.city !== user.city) {
      throw new Error("SV не может менять статус в другом регионе");
    }

    const isSubordinate = await checkDirectSubordinate(
      conn,
      user.id,
      doc.author_user_id,
    );
    if (!isSubordinate) {
      throw new Error("SV может менять статус только документов TA");
    }

    return doc;
  }

  // SV: NEW/REVISION -> REVISION/REJECTED
  if (["REVISION", "REJECTED"].includes(nextStatus) && user.role === 4) {
    if (!["NEW", "REVISION"].includes(doc.status)) {
      throw new Error("SV может менять статус только до PREPARED");
    }
    if (doc.city !== user.city) {
      throw new Error("SV не может изменять статус в другом регионе");
    }

    const isSubordinate = await checkDirectSubordinate(
      conn,
      user.id,
      doc.author_user_id,
    );
    if (!isSubordinate) {
      throw new Error("SV может изменять статус только документов TA");
    }

    return doc;
  }

  // Admin / Director: PREPARED -> REVISION/REJECTED
  if (
    ["REVISION", "REJECTED"].includes(nextStatus) &&
    (user.role === 1 || user.role === 2)
  ) {
    if (doc.status !== "PREPARED") {
      throw new Error("Admin/Director могут менять статус только из PREPARED");
    }
    return doc;
  }

  // NTO: PREPARED -> REVISION/REJECTED
  if (["REVISION", "REJECTED"].includes(nextStatus) && user.role === 3) {
    if (doc.status !== "PREPARED") {
      throw new Error("NTO может менять статус только из PREPARED");
    }

    const allowed = await canNtoAccessAuthor(conn, user.id, doc.author_user_id);
    if (!allowed) {
      throw new Error("NTO не может менять статус этого документа");
    }

    return doc;
  }

  // PREPARED от Admin/Director/NTO только для TA без руководителя
  if (nextStatus === "PREPARED" && [1, 2, 3].includes(user.role)) {
    if (!["NEW", "REVISION", "PREPARED"].includes(doc.status)) {
      throw new Error("Нельзя одобрить в этом статусе");
    }

    const orphanTa = await isTaWithoutSupervisor(conn, doc.author_user_id);
    if (!orphanTa) {
      throw new Error("PREPARED доступен только для TA без руководителя");
    }

    if (user.role === 3) {
      const allowed = await canNtoAccessAuthor(conn, user.id, doc.author_user_id);
      if (!allowed) {
        throw new Error("NTO не может одобрить этот документ");
      }
    }

    return doc;
  }

  throw new Error("Нет прав изменения статуса");
}
export async function signDocumentService(user, documentId, comment) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const doc = await checkCanSignDocument(conn, user, documentId);

    await conn.query(
      `
      UPDATE documents
      SET status = 'SIGNED',
          signed_by_user_id = ?,
          signed_at = NOW()
      WHERE id = ?
      `,
      [user.id, documentId],
    );

    await conn.query(
      `
      INSERT INTO document_history
      (document_id, user_id, action, old_status, new_status, comment)
      VALUES (?, ?, 'SIGN', ?, 'SIGNED', ?)
      `,
      [documentId, user.id, doc.status, comment ?? null],
    );

    await conn.commit();

    notifyDocumentSigned(user, documentId);

    return { status: "SIGNED" };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function prepareDocumentService(user, documentId, comment) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const doc = await checkCanChangeStatus(conn, user, documentId, "PREPARED");

    await conn.query(
      `
      UPDATE documents
      SET status = 'PREPARED'
      WHERE id = ?
      `,
      [documentId],
    );

    await conn.query(
      `
      INSERT INTO document_history
      (document_id, user_id, action, old_status, new_status, comment)
      VALUES (?, ?, 'PREPARE', ?, 'PREPARED', ?)
      `,
      [documentId, user.id, doc.status, comment ?? null],
    );

    await conn.commit();
    return { status: "PREPARED" };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function revisionDocumentService(user, documentId, comment) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const doc = await checkCanChangeStatus(conn, user, documentId, "REVISION");

    await conn.query(
      `
      UPDATE documents
      SET status = 'REVISION'
      WHERE id = ?
      `,
      [documentId],
    );

    await conn.query(
      `
      INSERT INTO document_history
      (document_id, user_id, action, old_status, new_status, comment)
      VALUES (?, ?, 'REVISION', ?, 'REVISION', ?)
      `,
      [documentId, user.id, doc.status, comment ?? null],
    );

    await conn.commit();
    return { status: "REVISION" };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function rejectDocumentService(user, documentId, comment) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const doc = await checkCanChangeStatus(conn, user, documentId, "REJECTED");

    await conn.query(
      `
      UPDATE documents
      SET status = 'REJECTED'
      WHERE id = ?
      `,
      [documentId],
    );

    await conn.query(
      `
      INSERT INTO document_history
      (document_id, user_id, action, old_status, new_status, comment)
      VALUES (?, ?, 'REJECT', ?, 'REJECTED', ?)
      `,
      [documentId, user.id, doc.status, comment ?? null],
    );

    await conn.commit();
    return { status: "REJECTED" };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function getDocumentsService(user, query) {
  const { status, from, to, limit = 20, offset = 0 } = query;

  const params = [];
  const where = [];

  /** -----------------------------
   * 1️⃣ Ограничение по ролям
   * ----------------------------- */

  // Admin и Director — видят всё
  if (user.role === 1 || user.role === 2) {
    // без ограничений
  }

  // TA — только свои
  else if (user.role === 5) {
    where.push("d.author_user_id = ?");
    params.push(user.id);
  }

  // SV — иерархия + регион
  else if (user.role === 4) {
    where.push("d.city = ?");
    params.push(user.city);

    // SV видит только своих прямых TA (depth = 1)
    where.push(`
      d.author_user_id IN (
        SELECT child_user_id
        FROM user_hierarchy
        WHERE parent_user_id = ?
        UNION ALL
        SELECT ?
      )
    `);
    params.push(user.id, user.id);
  }

  // NTO — иерархия + все TA без руководителя (без региона)
  else if (user.role === 3) {
    where.push(`
      (
        d.author_user_id IN (
          WITH RECURSIVE subordinates AS (
            SELECT child_user_id, 1 as depth
            FROM user_hierarchy
            WHERE parent_user_id = ?

            UNION ALL

            SELECT uh.child_user_id, s.depth + 1
            FROM user_hierarchy uh
            JOIN subordinates s ON s.child_user_id = uh.parent_user_id
            WHERE s.depth < 2
          )
          SELECT child_user_id FROM subordinates
          UNION ALL
          SELECT ?
        )
        OR d.author_user_id IN (
          SELECT u.id
          FROM users u
          WHERE u.role = 5
            AND NOT EXISTS (
              SELECT 1
              FROM user_hierarchy h
              WHERE h.child_user_id = u.id
            )
        )
      )
    `);
    params.push(user.id, user.id);
  }

  // Accountant / Warehouse — регион, без иерархии
  else if ([6, 7].includes(user.role)) {
    where.push("d.city = ?");
    params.push(user.city);
  }

  // fallback
  else {
    where.push("d.author_user_id = ?");
    params.push(user.id);
  }

  /** -----------------------------
   * 2️⃣ Фильтры
   * ----------------------------- */

  if (status) {
    where.push("d.status = ?");
    params.push(status);
  }

  if (from) {
    where.push("d.document_date >= ?");
    params.push(from);
  }

  if (to) {
    where.push("d.document_date <= ?");
    params.push(to);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      d.id,
      d.document_number,
      d.document_type,
      d.document_date,
      d.status,
      tp.name AS trade_point,
      c.name AS contractor,
      u.user_name AS author,
      d.created_at
    FROM documents d
    JOIN trade_points tp ON tp.id = d.trade_point_id
    JOIN contractors c ON c.id = d.contractor_id
    JOIN users u ON u.id = d.author_user_id
    ${whereSql}
    ORDER BY d.created_at DESC
    LIMIT ?
    OFFSET ?
  `;

  const [rows] = await pool.query(sql, [
    ...params,
    Number(limit),
    Number(offset),
  ]);

  return rows;
}

export async function getDocumentByIdService(user, documentId) {
  /** -----------------------------
   * 1️⃣ Заголовок + проверка доступа
   * ----------------------------- */

  const [rows] = await pool.query(
    `
    SELECT
      d.*,
      d.city AS city,
      tp.name AS trade_point_name,
      tp.address AS trade_point_address,
      c.name AS contractor_name,
      u.user_name AS author_name
    FROM documents d
    JOIN trade_points tp ON tp.id = d.trade_point_id
    JOIN contractors c ON c.id = d.contractor_id
    JOIN users u ON u.id = d.author_user_id
    WHERE d.id = ?
    `,
    [documentId],
  );

  if (rows.length === 0) {
    throw new Error("NOT_FOUND");
  }

  const doc = rows[0];

  /** -----------------------------
   * 2️⃣ Проверка прав
   * ----------------------------- */

  // Admin / Director — всегда можно
  if (user.role === 1 || user.role === 2) {
    // ok
  }

  // TA — только свои
  else if (user.role === 5) {
    if (doc.author_user_id !== user.id) {
      throw new Error("FORBIDDEN");
    }
  }

  // SV — регион + иерархия
  else if (user.role === 4) {
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
      [user.id],
    );

    const allowedIds = subs.map((r) => r.child_user_id);
    allowedIds.push(user.id);

    if (!allowedIds.includes(doc.author_user_id)) {
      throw new Error("FORBIDDEN");
    }
  }

  // NTO — иерархия + все TA без руководителя (без региона)
  else if (user.role === 3) {
    let allowed = false;

    const [subs] = await pool.query(
      `
      WITH RECURSIVE subordinates AS (
        SELECT child_user_id, 1 as depth
        FROM user_hierarchy
        WHERE parent_user_id = ?

        UNION ALL

        SELECT uh.child_user_id, s.depth + 1
        FROM user_hierarchy uh
        JOIN subordinates s
          ON s.child_user_id = uh.parent_user_id
        WHERE s.depth < 2
      )
      SELECT child_user_id FROM subordinates
      `,
      [user.id],
    );

    const allowedIds = subs.map((r) => r.child_user_id);
    allowedIds.push(user.id);
    allowed = allowedIds.includes(doc.author_user_id);

    if (!allowed) {
      const orphanTa = await isTaWithoutSupervisor(pool, doc.author_user_id);
      if (!orphanTa) {
        throw new Error("FORBIDDEN");
      }
    }
  }

  // Accountant / Warehouse — только регион
  else if ([6, 7].includes(user.role)) {
    if (doc.city !== user.city) {
      throw new Error("FORBIDDEN");
    }
  } else {
    throw new Error("FORBIDDEN");
  }

  /** -----------------------------
   * 3️⃣ Табличная часть
   * ----------------------------- */

  const [items] = await pool.query(
    `
    SELECT
      product_id,
      product_group_id,
      product_name_snapshot AS product_name,
      product_group_snapshot AS product_group,
      unit,
      quantity,
      manufacture_date,
      expiry_date,
      operation
    FROM document_items
    WHERE document_id = ?
    ORDER BY id
    `,
    [documentId],
  );

  /** -----------------------------
   * 4️⃣ История
   * ----------------------------- */

  const [history] = await pool.query(
    `
    SELECT
      h.action,
      h.old_status,
      h.new_status,
      h.comment,
      h.created_at,
      u.user_name AS user
    FROM document_history h
    JOIN users u ON u.id = h.user_id
    WHERE h.document_id = ?
    ORDER BY h.created_at
    `,
    [documentId],
  );

  /** -----------------------------
   * 5️⃣ Финальный ответ
   * ----------------------------- */

  return {
    id: doc.id,
    city: doc.city,
    documentNumber: doc.document_number,
    documentType: doc.document_type,
    documentDate: doc.document_date,
    status: doc.status,
    reason: doc.reason,
    comment: doc.comment,

    tradePoint: {
      name: doc.trade_point_name,
      address: doc.trade_point_address,
    },

    contractor: {
      name: doc.contractor_name,
    },

    author: doc.author_name,

    signedBy: doc.signed_by_user_id,
    signedAt: doc.signed_at,

    items,
    history,
  };
}
export async function getDocumentHistoryService(user, documentId) {
  // Сначала проверяем доступ к документу
  await getDocumentByIdService(user, documentId);

  const [history] = await pool.query(
    `
    SELECT
      dh.id,
      dh.action,
      dh.old_status,
      dh.new_status,
      dh.comment,
      dh.created_at,
      u.user_name
    FROM document_history dh
    LEFT JOIN users u ON u.id = dh.user_id
    WHERE dh.document_id = ?
    ORDER BY dh.created_at DESC
    `,
    [documentId],
  );

  return history;
}

export async function getDocumentNotificationHistoryService(user, documentId) {
  // Проверяем доступ к документу
  await getDocumentByIdService(user, documentId);

  const [rows] = await pool.query(
    `
    SELECT
      channel,
      target,
      status,
      error_text,
      created_at
    FROM notification_log
    WHERE document_id = ?
    ORDER BY created_at DESC
    `,
    [documentId]
  );

  return rows;
}

export async function updateDocumentService(user, documentId, payload) {
  const { documentType, documentDate, tradePointId, reason, comment, items } =
    payload;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ Получаем документ
    const [[doc]] = await connection.query(
      `
      SELECT id, status, author_user_id, city
      FROM documents
      WHERE id = ?
      FOR UPDATE
      `,
      [documentId],
    );

    if (!doc) {
      throw new Error("NOT_FOUND");
    }

    if (doc.author_user_id !== user.id) {
      throw new Error("Тільки автор може редагувати документ");
    }

    if (!["NEW", "REVISION"].includes(doc.status)) {
      throw new Error(
        "Можна редагувати тільки документи зі статусом NEW або REVISION",
      );
    }

    // 2️⃣ Валидация
    if (!documentType || !documentDate || !tradePointId || !items?.length) {
      throw new Error("Некорректные данные документа");
    }

    if (documentType === "EXCHANGE") {
      const takeItems = items.filter((i) => i.operation === "TAKE");
      const giveItems = items.filter((i) => i.operation === "GIVE");

      if (!takeItems.length || !giveItems.length) {
        throw new Error("Для обміну обовʼязково потрібні TAKE і GIVE");
      }

      const takeQty = takeItems.reduce(
        (sum, i) => sum + Number(i.quantity || 0),
        0,
      );

      const giveQty = giveItems.reduce(
        (sum, i) => sum + Number(i.quantity || 0),
        0,
      );

      if (takeQty !== giveQty) {
        throw new Error(
          `Кількість не співпадає: забрали ${takeQty}, видали ${giveQty}`,
        );
      }
    }

    if (documentType === "RETURN") {
      if (items.some((i) => i.operation === "GIVE")) {
        throw new Error("Для повернення дозволено тільки TAKE");
      }
    }

    // 3️⃣ Проверяем торговую точку
    const [[tp]] = await connection.query(
      `
      SELECT contractor_id
      FROM trade_points
      WHERE id = ? AND is_active = 1
      `,
      [tradePointId],
    );

    if (!tp) {
      throw new Error("Торговая точка не найдена или неактивна");
    }

    // 4️⃣ Обновляем документ
    await connection.query(
      `
      UPDATE documents
      SET
        document_type = ?,
        document_date = ?,
        trade_point_id = ?,
        contractor_id = ?,
        reason = ?,
        comment = ?,
        status = 'NEW'
      WHERE id = ?
      `,
      [
        documentType,
        documentDate,
        tradePointId,
        tp.contractor_id,
        reason,
        comment ?? null,
        documentId,
      ],
    );

    // 5️⃣ Удаляем старые товары
    await connection.query(
      `DELETE FROM document_items WHERE document_id = ?`,
      [documentId],
    );

    // 6️⃣ Добавляем новые товары (как в create)
    for (const item of items) {
      const {
        productId,
        unit,
        quantity,
        manufactureDate,
        expiryDate,
        operation,
      } = item;

      if (!productId || quantity <= 0 || !operation) {
        throw new Error("Некорректная строка товара");
      }

      if (!["TAKE", "GIVE"].includes(operation)) {
        throw new Error("Неверное значение operation");
      }

      const [[product]] = await connection.query(
        `
        SELECT p.name, g.id AS group_id, g.name AS group_name
        FROM products p
        JOIN product_groups g ON g.id = p.group_id
        WHERE p.id = ? AND p.is_active = 1
        `,
        [productId],
      );

      if (!product) {
        throw new Error(`Товар ${productId} не найден`);
      }

      await connection.query(
        `
        INSERT INTO document_items (
          document_id,
          product_id,
          product_group_id,
          product_name_snapshot,
          product_group_snapshot,
          unit,
          quantity,
          manufacture_date,
          expiry_date,
          operation
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          documentId,
          productId,
          product.group_id,
          product.name,
          product.group_name,
          unit,
          quantity,
          manufactureDate,
          expiryDate,
          operation,
        ],
      );
    }

    // 7️⃣ История
    await connection.query(
      `
      INSERT INTO document_history
        (document_id, user_id, action, old_status, new_status, comment)
      VALUES (?, ?, 'STATUS_CHANGE', ?, 'NEW', ?)
      `,
      [documentId, user.id, doc.status, "Редагування документа"],
    );

    await connection.commit();

    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
