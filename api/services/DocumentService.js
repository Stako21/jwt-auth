import pool from "../db.cjs";
import { notifyDocumentSigned } from "./notify.service.js";
import {
  getCityById,
  getUserBranchId,
  getUserVisibleBranchIds,
} from "./appConfig.service.js";

const EXECUTOR_TYPE_DRIVER_PREFIX = "[[EXECUTOR_TYPE:DRIVER]]";
const OPTIONAL_ITEM_DATE_SENTINEL = "1000-01-01";

function normalizeExecutorType(value) {
  return value === "DRIVER" ? "DRIVER" : "TA";
}

function encodeDocumentComment(comment, executorType) {
  const normalizedExecutorType = normalizeExecutorType(executorType);
  const normalizedComment = typeof comment === "string" ? comment : "";
  const hasVisibleComment = normalizedComment.trim().length > 0;

  if (normalizedExecutorType === "TA") {
    return hasVisibleComment ? normalizedComment : null;
  }

  return hasVisibleComment
    ? `${EXECUTOR_TYPE_DRIVER_PREFIX}\n${normalizedComment}`
    : EXECUTOR_TYPE_DRIVER_PREFIX;
}

function decodeDocumentComment(comment) {
  if (typeof comment !== "string" || !comment.length) {
    return { executorType: "TA", comment: comment ?? null };
  }

  if (comment.startsWith(EXECUTOR_TYPE_DRIVER_PREFIX)) {
    const strippedComment = comment
      .slice(EXECUTOR_TYPE_DRIVER_PREFIX.length)
      .replace(/^\r?\n/, "");

    return {
      executorType: "DRIVER",
      comment: strippedComment || "",
    };
  }

  return {
    executorType: "TA",
    comment,
  };
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
}

function getStoredItemDate(value, operation) {
  const normalizedValue = normalizeOptionalDate(value);

  if (normalizedValue !== null) {
    return normalizedValue;
  }

  return operation === "GIVE" ? OPTIONAL_ITEM_DATE_SENTINEL : null;
}

function getResponseItemDate(value, operation) {
  if (!value) {
    return null;
  }

  if (operation === "GIVE" && value === OPTIONAL_ITEM_DATE_SENTINEL) {
    return null;
  }

  return value;
}

/**
 * user: { id, role, city }
 * payload: тело запроса
 */
export async function createDocumentService(user, payload) {

  const {
    documentType,
    documentDate,
    tradePointId,
    reason,
    comment,
    executorType,
    items,
  } = payload;

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
  const branchId = getUserBranchId(user);
  const storedComment = encodeDocumentComment(comment, executorType);

  try {
    await connection.beginTransaction();

    /** 1️⃣ Получаем контрагента */
    const [[tp]] = await connection.query(
      `
      SELECT contractor_id
      FROM trade_points
      WHERE id = ?
        AND is_active = 1
        AND branch_id = ?
      `,
      [tradePointId, branchId],
    );

    if (!tp) {
      throw new Error("Торговая точка не найдена или неактивна");
    }

    /** 2️⃣ Генерация номера */
    const city = user.city;
    const cityConfig = await getCityById(city);

    if (!cityConfig?.documentPrefix) {
      throw new Error("Для міста не налаштований префікс документів");
    }

    const [[seq]] = await connection.query(
      `
      SELECT last_number
      FROM document_sequences
      WHERE city = ?
        AND branch_id = ?
      FOR UPDATE
      `,
      [city, branchId],
    );

    let nextNumber = 1;

    if (!seq) {
      await connection.query(
        `INSERT INTO document_sequences (city, last_number, branch_id) VALUES (?, 1, ?)`,
        [city, branchId],
      );
    } else {
      nextNumber = seq.last_number + 1;
      await connection.query(
        `
        UPDATE document_sequences
        SET last_number = ?
        WHERE city = ?
          AND branch_id = ?
        `,
        [nextNumber, city, branchId],
      );
    }

    const prefix = cityConfig.documentPrefix;
    const documentNumber = `${prefix}${String(nextNumber).padStart(6, "0")}`;

    /** 3️⃣ Создаём документ */
    const [docRes] = await connection.query(
      `
      INSERT INTO documents (
        document_type,
        document_number,
        document_sequence,
        city,
        branch_id,
        document_date,
        trade_point_id,
        contractor_id,
        author_user_id,
        status,
        reason,
        comment
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?)
      `,
      [
        documentType,
        documentNumber,
        nextNumber,
        city,
        branchId,
        documentDate,
        tradePointId,
        tp.contractor_id,
        user.id,
        reason,
        storedComment,
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

      if (operation !== "GIVE" && (!manufactureDate || !expiryDate)) {
        throw new Error("Для цієї позиції дати виробництва та придатності обовʼязкові");
      }

      const [[product]] = await connection.query(
        `
        SELECT p.name, g.id AS group_id, g.name AS group_name
        FROM products p
        JOIN product_groups g ON g.id = p.group_id
        WHERE p.id = ?
          AND p.is_active = 1
          AND p.branch_id = ?
          AND g.branch_id = ?
        `,
        [productId, branchId, branchId],
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
          getStoredItemDate(manufactureDate, operation),
          getStoredItemDate(expiryDate, operation),
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

async function getUserVisibleCityIds(conn, user) {
  const cityIds = new Set([Number(user.city)]);

  const [rows] = await conn.query(
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

async function isTaWithoutSupervisor(conn, authorId, branchId) {
  const [[row]] = await conn.query(
    `
    SELECT 1
    FROM users u
    LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
    WHERE u.id = ?
      AND u.role = 5
      AND u.branch_id = ?
      AND h.parent_user_id IS NULL
    `,
    [authorId, branchId],
  );

  return !!row;
}

async function canNtoAccessAuthor(conn, ntoUserId, authorId, branchId) {
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

  return isTaWithoutSupervisor(conn, authorId, branchId);
}

async function checkCanSignDocument(conn, user, documentId) {
  const branchId = getUserBranchId(user);
  const [[doc]] = await conn.query(
    `
    SELECT
      d.id,
      d.status,
      d.city,
      d.author_user_id
    FROM documents d
    WHERE d.id = ?
      AND d.branch_id = ?
    `,
    [documentId, branchId],
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
    const allowed = await canNtoAccessAuthor(
      conn,
      user.id,
      doc.author_user_id,
      branchId,
    );
    if (!allowed) {
      throw new Error("NTO не может подписать этот документ");
    }
    return doc;
  }

  throw new Error("Нет прав подписи");
}

async function checkCanChangeStatus(conn, user, documentId, nextStatus) {
  const branchId = getUserBranchId(user);
  const [[doc]] = await conn.query(
    `
    SELECT
      d.id,
      d.status,
      d.city,
      d.author_user_id
    FROM documents d
    WHERE d.id = ?
      AND d.branch_id = ?
    `,
    [documentId, branchId],
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

    const allowed = await canNtoAccessAuthor(
      conn,
      user.id,
      doc.author_user_id,
      branchId,
    );
    if (!allowed) {
      throw new Error("NTO не может менять статус этого документа");
    }

    return doc;
  }

  // PREPARED от Admin/Director/NTO без ограничения "TA без руководителя"
  if (nextStatus === "PREPARED" && [1, 2, 3].includes(user.role)) {
    if (!["NEW", "REVISION", "PREPARED"].includes(doc.status)) {
      throw new Error("Нельзя одобрить в этом статусе");
    }

    if (user.role === 3) {
      const allowed = await canNtoAccessAuthor(
        conn,
        user.id,
        doc.author_user_id,
        branchId,
      );
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
  const { status, from, to } = query;
  const branchId = getUserBranchId(user);
  const params = [];
  const where = [];

  if (user.role === 1 || user.role === 2) {
    const visibleBranchIds = await getUserVisibleBranchIds(user);
    where.push(`d.branch_id IN (${visibleBranchIds.map(() => "?").join(", ")})`);
    params.push(...visibleBranchIds);
  } else {
    where.push("d.branch_id = ?");
    params.push(branchId);
  }

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
            AND u.branch_id = d.branch_id
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
    const cityIds = await getUserVisibleCityIds(pool, user);
    where.push(`d.city IN (${cityIds.map(() => "?").join(", ")})`);
    params.push(...cityIds);
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
      d.branch_id AS branch_id,
      b.name AS branch_name,
      b.short_name AS branch_short_name,
      d.document_number,
      d.document_type,
      d.document_date,
      d.status,
      tp.name AS trade_point,
      c.name AS contractor,
      d.author_user_id,
      u.user_name AS author,
      d.created_at
    FROM documents d
    JOIN branches b ON b.id = d.branch_id
    JOIN trade_points tp ON tp.id = d.trade_point_id
    JOIN contractors c ON c.id = d.contractor_id
    JOIN users u ON u.id = d.author_user_id
    ${whereSql}
    ORDER BY d.created_at DESC
  `;

  const [rows] = await pool.query(sql, params);

  return rows;
}

export async function getDocumentByIdService(user, documentId) {
  const branchId = getUserBranchId(user);
  const visibleBranchIds =
    user.role === 1 || user.role === 2
      ? await getUserVisibleBranchIds(user)
      : [branchId];
  /** -----------------------------
   * 1️⃣ Заголовок + проверка доступа
   * ----------------------------- */

  const [rows] = await pool.query(
    `
    SELECT
      d.*,
      d.branch_id AS branch_id,
      b.name AS branch_name,
      b.short_name AS branch_short_name,
      d.city AS city,
      tp.name AS trade_point_name,
      tp.address AS trade_point_address,
      c.name AS contractor_name,
      u.user_name AS author_name
    FROM documents d
    JOIN branches b ON b.id = d.branch_id
    JOIN trade_points tp ON tp.id = d.trade_point_id
    JOIN contractors c ON c.id = d.contractor_id
    JOIN users u ON u.id = d.author_user_id
    WHERE d.id = ?
      AND d.branch_id IN (${visibleBranchIds.map(() => "?").join(", ")})
    `,
    [documentId, ...visibleBranchIds],
  );

  if (rows.length === 0) {
    throw new Error("NOT_FOUND");
  }

  const doc = rows[0];
  const decodedComment = decodeDocumentComment(doc.comment);

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
      const orphanTa = await isTaWithoutSupervisor(
        pool,
        doc.author_user_id,
        Number(doc.branch_id),
      );
      if (!orphanTa) {
        throw new Error("FORBIDDEN");
      }
    }
  }

  // Accountant / Warehouse — только регион
  else if ([6, 7].includes(user.role)) {
    const cityIds = await getUserVisibleCityIds(pool, user);
    if (!cityIds.includes(Number(doc.city))) {
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

  const normalizedItems = items.map((item) => ({
    ...item,
    manufacture_date: getResponseItemDate(item.manufacture_date, item.operation),
    expiry_date: getResponseItemDate(item.expiry_date, item.operation),
  }));

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
    branchId: doc.branch_id,
    branchName: doc.branch_name,
    branchShortName: doc.branch_short_name,
    city: doc.city,
    documentNumber: doc.document_number,
    documentType: doc.document_type,
    documentDate: doc.document_date,
    status: doc.status,
    reason: doc.reason,
    comment: decodedComment.comment,
    executorType: decodedComment.executorType,

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

    items: normalizedItems,
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
  const {
    documentType,
    documentDate,
    tradePointId,
    reason,
    comment,
    executorType,
    items,
  } = payload;
  const branchId = getUserBranchId(user);

  const connection = await pool.getConnection();
  const storedComment = encodeDocumentComment(comment, executorType);

  try {
    await connection.beginTransaction();

    // 1️⃣ Получаем документ
    const [[doc]] = await connection.query(
      `
      SELECT id, status, author_user_id, city
      FROM documents
      WHERE id = ?
        AND branch_id = ?
      FOR UPDATE
      `,
      [documentId, branchId],
    );

    if (!doc) {
      throw new Error("NOT_FOUND");
    }

    const isAuthor = doc.author_user_id === user.id;

    if (!isAuthor) {
      let canEditAsSv = false;

      if (user.role === 4) {
        if (doc.city !== user.city) {
          throw new Error("SV може редагувати тільки документи свого регіону");
        }

        const isDirectSubordinate = await checkDirectSubordinate(
          connection,
          user.id,
          doc.author_user_id,
        );

        if (isDirectSubordinate) {
          const [[author]] = await connection.query(
            `
            SELECT role
            FROM users
            WHERE id = ?
              AND branch_id = ?
            `,
            [doc.author_user_id, branchId],
          );

          canEditAsSv = author?.role === 5;
        }
      }

      if (!canEditAsSv) {
        throw new Error("Тільки автор або його СВ може редагувати документ");
      }
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
      WHERE id = ?
        AND is_active = 1
        AND branch_id = ?
      `,
      [tradePointId, branchId],
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
        AND branch_id = ?
      `,
      [
        documentType,
        documentDate,
        tradePointId,
        tp.contractor_id,
        reason,
        storedComment,
        documentId,
        branchId,
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

      if (operation !== "GIVE" && (!manufactureDate || !expiryDate)) {
        throw new Error("Для цієї позиції дати виробництва та придатності обовʼязкові");
      }

      const [[product]] = await connection.query(
        `
        SELECT p.name, g.id AS group_id, g.name AS group_name
        FROM products p
        JOIN product_groups g ON g.id = p.group_id
        WHERE p.id = ?
          AND p.is_active = 1
          AND p.branch_id = ?
          AND g.branch_id = ?
        `,
        [productId, branchId, branchId],
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
          getStoredItemDate(manufactureDate, operation),
          getStoredItemDate(expiryDate, operation),
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
