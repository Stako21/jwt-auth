import pool from "../db.cjs";
import { ROLE_IDS } from "../utils/roles.js";
import { getCityById, getUserBranchId, getUserVisibleBranchIds } from "./appConfig.service.js";

const CREATOR_ROLES = new Set([ROLE_IDS.Admin, ROLE_IDS.Director, ROLE_IDS.SV, ROLE_IDS.TA]);
const MOVEMENT_TYPES = new Set(["INSTALL", "RETURN"]);
const EDITABLE_STATUSES = new Set(["NEW", "REVISION"]);
const ACCOUNTING_STATUSES = new Set(["NOT_COMPLETED", "PLANNED"]);

function text(value, maxLength) {
  const normalized = String(value || "").trim();
  return normalized.slice(0, maxLength);
}

async function directSubordinate(conn, parentId, childId) {
  const [[row]] = await conn.query(
    "SELECT 1 FROM user_hierarchy WHERE parent_user_id = ? AND child_user_id = ? LIMIT 1",
    [parentId, childId],
  );
  return Boolean(row);
}

async function hierarchyContains(conn, parentId, childId) {
  const [[row]] = await conn.query(
    `WITH RECURSIVE subordinates AS (
       SELECT child_user_id FROM user_hierarchy WHERE parent_user_id = ?
       UNION ALL
       SELECT uh.child_user_id FROM user_hierarchy uh
       JOIN subordinates s ON s.child_user_id = uh.parent_user_id
     )
     SELECT 1 FROM subordinates WHERE child_user_id = ? LIMIT 1`,
    [parentId, childId],
  );
  return Boolean(row);
}

async function isTaWithoutSupervisor(conn, taId, branchId) {
  const [[row]] = await conn.query(
    `SELECT 1
     FROM users u
     LEFT JOIN user_hierarchy h ON h.child_user_id = u.id
     WHERE u.id = ? AND u.role = ? AND u.branch_id = ?
       AND h.parent_user_id IS NULL
     LIMIT 1`,
    [taId, ROLE_IDS.TA, branchId],
  );
  return Boolean(row);
}

async function grantedBranchIds(conn, user) {
  const ids = new Set([getUserBranchId(user)]);
  const [rows] = await conn.query(
    "SELECT branch_id FROM user_branch_access WHERE user_id = ?",
    [user.id],
  );
  rows.forEach((row) => ids.add(Number(row.branch_id)));
  return Array.from(ids).filter(Boolean);
}

export async function getTroGrantedBranchIds(user) {
  return grantedBranchIds(pool, user);
}

async function notifyStatus(user, documentId, oldStatus, newStatus) {
  const { notifyDocumentStatusChanged } = await import("./notify.service.js");
  return notifyDocumentStatusChanged(user, documentId, oldStatus, newStatus);
}

async function resolveTa(conn, user, requestedTaId, branchId) {
  const taId = Number(user.role) === ROLE_IDS.TA ? Number(user.id) : Number(requestedTaId);
  if (!taId) throw new Error("Оберіть торгового агента");

  const [[ta]] = await conn.query(
    `SELECT id, city, branch_id, user_name
     FROM users WHERE id = ? AND role = ? AND is_active = 1 AND branch_id = ?`,
    [taId, ROLE_IDS.TA, branchId],
  );
  if (!ta) throw new Error("Торгового агента не знайдено");

  if (Number(user.role) === ROLE_IDS.SV && !(await directSubordinate(conn, user.id, ta.id))) {
    throw new Error("SV може обрати тільки свого торгового агента");
  }
  if (Number(user.role) === ROLE_IDS.TA && ta.id !== Number(user.id)) {
    throw new Error("TA може створити документ тільки для себе");
  }
  return ta;
}

export function mergeTroItemsByName(items) {
  const normalizedByName = new Map();
  items.forEach((item) => {
    const name = String(item.name || "").trim();
    const nameKey = name.toLocaleLowerCase("uk-UA");
    const existing = normalizedByName.get(nameKey);
    if (existing) existing.quantity += item.quantity;
    else normalizedByName.set(nameKey, { ...item, name });
  });
  return Array.from(normalizedByName.values());
}

async function validateItems(conn, items, branchId) {
  if (!Array.isArray(items) || !items.length) throw new Error("Додайте хоча б одну позицію ТРО");
  const normalized = [];
  for (const item of items) {
    const productId = Number(item.troProductId);
    const quantity = Number(item.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Для кожної позиції ТРО потрібна коректна кількість");
    }
    const [[product]] = await conn.query(
      "SELECT id, name FROM tro_products WHERE id = ? AND branch_id = ? AND is_active = 1",
      [productId, branchId],
    );
    if (!product) throw new Error("Позицію ТРО не знайдено або деактивовано");
    normalized.push({ productId, quantity, name: product.name });
  }
  return mergeTroItemsByName(normalized);
}

async function insertItems(conn, documentId, items) {
  for (const item of items) {
    await conn.query(
      `INSERT INTO tro_document_items
        (document_id, tro_product_id, product_name_snapshot, quantity)
       VALUES (?, ?, ?, ?)`,
      [documentId, item.productId, item.name, item.quantity],
    );
  }
}

export async function getTroTaOptionsService(user) {
  const branchId = getUserBranchId(user);
  if (!CREATOR_ROLES.has(Number(user.role))) return [];

  if (Number(user.role) === ROLE_IDS.TA) {
    const [rows] = await pool.query(
      "SELECT id, user_name AS name, city FROM users WHERE id = ? AND role = ? AND is_active = 1",
      [user.id, ROLE_IDS.TA],
    );
    return rows;
  }

  if (Number(user.role) === ROLE_IDS.SV) {
    const [rows] = await pool.query(
      `SELECT u.id, u.user_name AS name, u.city
       FROM user_hierarchy h JOIN users u ON u.id = h.child_user_id
       WHERE h.parent_user_id = ? AND u.role = ? AND u.branch_id = ? AND u.is_active = 1
       ORDER BY u.user_name`,
      [user.id, ROLE_IDS.TA, branchId],
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT id, user_name AS name, city FROM users
     WHERE role = ? AND branch_id = ? AND is_active = 1 ORDER BY user_name`,
    [ROLE_IDS.TA, branchId],
  );
  return rows;
}

export async function createTroDocumentService(user, payload) {
  if (!CREATOR_ROLES.has(Number(user.role))) throw new Error("Немає прав створення документа ТРО");
  const branchId = getUserBranchId(user);
  const movementType = String(payload.movementType || "").toUpperCase();
  if (!MOVEMENT_TYPES.has(movementType)) throw new Error("Оберіть тип руху ТРО");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ta = await resolveTa(conn, user, payload.taUserId, branchId);
    const [[tradePoint]] = await conn.query(
      `SELECT tp.id, tp.contractor_id FROM trade_points tp
       JOIN contractors c ON c.id = tp.contractor_id
       WHERE tp.id = ? AND tp.branch_id = ? AND c.branch_id = ?
         AND tp.is_active = 1 AND c.is_active = 1`,
      [Number(payload.tradePointId), branchId, branchId],
    );
    if (!tradePoint) throw new Error("Торгову точку не знайдено");
    const items = await validateItems(conn, payload.items, branchId);
    const city = await getCityById(ta.city);
    if (!city || Number(city.branchId) !== branchId || !city.documentPrefix) {
      throw new Error("Для міста TA не налаштовано префікс документа");
    }

    await conn.query(
      `INSERT IGNORE INTO tro_document_sequences (branch_id, city_id, last_number)
       VALUES (?, ?, 0)`,
      [branchId, ta.city],
    );
    const [[sequence]] = await conn.query(
      "SELECT last_number FROM tro_document_sequences WHERE branch_id = ? AND city_id = ? FOR UPDATE",
      [branchId, ta.city],
    );
    const nextNumber = Number(sequence.last_number) + 1;
    await conn.query(
      `UPDATE tro_document_sequences SET last_number = ?
       WHERE branch_id = ? AND city_id = ?`,
      [nextNumber, branchId, ta.city],
    );
    const documentNumber = `ТРО-${city.documentPrefix}-${String(nextNumber).padStart(6, "0")}`;
    const reason = movementType === "INSTALL" ? "Установка ТРО" : "Повернення ТРО";

    const [result] = await conn.query(
      `INSERT INTO documents
        (document_type, document_number, document_sequence, city, branch_id,
         document_date, trade_point_id, contractor_id, author_user_id, status, reason, comment)
       VALUES ('TRO', ?, ?, ?, ?, NOW(), ?, ?, ?, 'NEW', ?, ?)`,
      [documentNumber, nextNumber, ta.city, branchId, tradePoint.id, tradePoint.contractor_id,
        user.id, reason, text(payload.comment, 250) || null],
    );
    await conn.query(
      `INSERT INTO tro_document_details (document_id, ta_user_id, movement_type)
       VALUES (?, ?, ?)`,
      [result.insertId, ta.id, movementType],
    );
    await insertItems(conn, result.insertId, items);
    await conn.query(
      `INSERT INTO document_history (document_id, user_id, action, old_status, new_status)
       VALUES (?, ?, 'CREATE', NULL, 'NEW')`,
      [result.insertId, user.id],
    );
    await conn.commit();
    return { id: result.insertId, documentNumber, status: "NEW" };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function loadTroDocument(conn, documentId, lock = false) {
  const [[doc]] = await conn.query(
    `SELECT d.*, t.ta_user_id, t.movement_type, t.up_document_number,
       t.executor_name, t.accountant_user_id, t.app_install, t.photo_install,
       t.app_return, t.warehouse_spec_return, ta.user_name AS ta_name
     FROM documents d JOIN tro_document_details t ON t.document_id = d.id
     JOIN users ta ON ta.id = t.ta_user_id
     WHERE d.id = ? AND d.document_type = 'TRO' ${lock ? "FOR UPDATE" : ""}`,
    [documentId],
  );
  if (!doc) throw new Error("NOT_FOUND");
  return doc;
}

async function ensureAccess(conn, user, doc) {
  const role = Number(user.role);
  if ([ROLE_IDS.Admin, ROLE_IDS.Director].includes(role)) {
    const ids = await getUserVisibleBranchIds(user);
    if (!ids.includes(Number(doc.branch_id))) throw new Error("FORBIDDEN");
    return;
  }
  if (role === ROLE_IDS.Accountant) {
    const ids = await grantedBranchIds(conn, user);
    if (!ids.includes(Number(doc.branch_id))) throw new Error("FORBIDDEN");
    return;
  }
  if (role === ROLE_IDS.TA && Number(doc.ta_user_id) === Number(user.id)) return;
  if (role === ROLE_IDS.SV && (Number(doc.author_user_id) === Number(user.id) || await directSubordinate(conn, user.id, doc.ta_user_id))) return;
  if (role === ROLE_IDS.NTO && (
    await hierarchyContains(conn, user.id, doc.ta_user_id) ||
    await hierarchyContains(conn, user.id, doc.author_user_id) ||
    await isTaWithoutSupervisor(conn, doc.ta_user_id, doc.branch_id)
  )) return;
  throw new Error("FORBIDDEN");
}

export async function assertTroDocumentAccessService(user, documentId) {
  const doc = await loadTroDocument(pool, documentId);
  await ensureAccess(pool, user, doc);
  return doc;
}

async function canApprove(conn, user, doc) {
  const role = Number(user.role);
  if (role === ROLE_IDS.SV) {
    return Number(doc.author_user_id) === Number(user.id) || directSubordinate(conn, user.id, doc.ta_user_id);
  }
  if (role === ROLE_IDS.NTO) {
    return (await hierarchyContains(conn, user.id, doc.ta_user_id)) ||
      (await hierarchyContains(conn, user.id, doc.author_user_id)) ||
      isTaWithoutSupervisor(conn, doc.ta_user_id, doc.branch_id);
  }
  return false;
}

export async function isTroDocumentService(documentId) {
  const [[row]] = await pool.query("SELECT document_type FROM documents WHERE id = ?", [documentId]);
  return row?.document_type === "TRO";
}

export async function updateTroDocumentService(user, documentId, payload) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await loadTroDocument(conn, documentId, true);
    await ensureAccess(conn, user, doc);
    if (!EDITABLE_STATUSES.has(doc.status)) throw new Error("Документ уже недоступний для редагування");
    const isAuthor = Number(doc.author_user_id) === Number(user.id);
    const canEditAsSv = Number(user.role) === ROLE_IDS.SV && await directSubordinate(conn, user.id, doc.ta_user_id);
    if (!isAuthor && !canEditAsSv) throw new Error("Редагувати може автор або відповідальний SV");

    const movementType = String(payload.movementType || "").toUpperCase();
    if (!MOVEMENT_TYPES.has(movementType)) throw new Error("Оберіть тип руху ТРО");
    const ta = await resolveTa(conn, user, payload.taUserId || doc.ta_user_id, doc.branch_id);
    const [[tp]] = await conn.query(
      `SELECT tp.id, tp.contractor_id FROM trade_points tp JOIN contractors c ON c.id = tp.contractor_id
       WHERE tp.id = ? AND tp.branch_id = ? AND c.branch_id = ? AND tp.is_active = 1 AND c.is_active = 1`,
      [Number(payload.tradePointId), doc.branch_id, doc.branch_id],
    );
    if (!tp) throw new Error("Торгову точку не знайдено");
    const items = await validateItems(conn, payload.items, doc.branch_id);
    await conn.query(
      `UPDATE documents SET trade_point_id = ?, contractor_id = ?, comment = ?, status = 'NEW' WHERE id = ?`,
      [tp.id, tp.contractor_id, text(payload.comment, 250) || null, documentId],
    );
    await conn.query(
      "UPDATE tro_document_details SET ta_user_id = ?, movement_type = ? WHERE document_id = ?",
      [ta.id, movementType, documentId],
    );
    await conn.query("DELETE FROM tro_document_items WHERE document_id = ?", [documentId]);
    await insertItems(conn, documentId, items);
    await conn.query(
      `INSERT INTO document_history (document_id, user_id, action, old_status, new_status, comment)
       VALUES (?, ?, 'UPDATE', ?, 'NEW', ?)`,
      [documentId, user.id, doc.status, "Оновлено документ ТРО"],
    );
    await conn.commit();
    return { id: documentId, status: "NEW" };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function changeWorkflowStatus(user, documentId, nextStatus, action, comment) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await loadTroDocument(conn, documentId, true);
    await ensureAccess(conn, user, doc);
    if (!EDITABLE_STATUSES.has(doc.status)) throw new Error("Статус документа вже не можна змінити");
    const approver = await canApprove(conn, user, doc);
    const authorReject = nextStatus === "REJECTED" && Number(doc.author_user_id) === Number(user.id);
    if (!approver && !authorReject) throw new Error("Немає прав зміни статусу документа ТРО");
    await conn.query(
      `UPDATE documents SET status = ?,
        signed_by_user_id = IF(? = 'NOT_COMPLETED', ?, signed_by_user_id),
        signed_at = IF(? = 'NOT_COMPLETED', NOW(), signed_at)
       WHERE id = ?`,
      [nextStatus, nextStatus, user.id, nextStatus, documentId],
    );
    await conn.query(
      `INSERT INTO document_history (document_id, user_id, action, old_status, new_status, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [documentId, user.id, action, doc.status, nextStatus, text(comment, 250) || null],
    );
    await conn.commit();
    notifyStatus(user, documentId, doc.status, nextStatus).catch((error) =>
      console.error("TRO status notification failed:", error),
    );
    return { status: nextStatus };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export const signTroDocumentService = (user, id, comment) => changeWorkflowStatus(user, id, "NOT_COMPLETED", "SIGN", comment);
export const revisionTroDocumentService = (user, id, comment) => changeWorkflowStatus(user, id, "REVISION", "REVISION", comment);
export const rejectTroDocumentService = (user, id, comment) => changeWorkflowStatus(user, id, "REJECTED", "REJECT", comment);

export async function updateTroAccountingService(user, documentId, payload) {
  if (Number(user.role) !== ROLE_IDS.Accountant) throw new Error("Тільки бухгалтер може заповнювати ці поля");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const doc = await loadTroDocument(conn, documentId, true);
    await ensureAccess(conn, user, doc);
    if (!ACCOUNTING_STATUSES.has(doc.status)) throw new Error("Бухгалтерські поля вже недоступні");

    const upNumber = text(payload.upDocumentNumber, 20);
    const executorName = text(payload.executorName, 150);
    const appInstall = doc.movement_type === "INSTALL" && Boolean(payload.appInstall);
    const photoInstall = doc.movement_type === "INSTALL" && Boolean(payload.photoInstall);
    const appReturn = doc.movement_type === "RETURN" && Boolean(payload.appReturn);
    const warehouseSpecReturn = doc.movement_type === "RETURN" && Boolean(payload.warehouseSpecReturn);
    const confirmed = Boolean(payload.confirmCompleted);
    const requiredChecks = doc.movement_type === "INSTALL"
      ? appInstall && photoInstall
      : appReturn && warehouseSpecReturn;
    if (confirmed && (!upNumber || !executorName || !requiredChecks)) {
      throw new Error("Для виконання заповніть номер УП, виконавця та обидві відмітки");
    }
    const previousUpNumber = text(doc.up_document_number, 20);
    const upNumberChanged = previousUpNumber && previousUpNumber !== upNumber;
    const nextStatus = confirmed
      ? "COMPLETED"
      : !upNumber || upNumberChanged
        ? "NOT_COMPLETED"
        : "PLANNED";
    await conn.query(
      `UPDATE tro_document_details SET up_document_number = ?, executor_name = ?,
       accountant_user_id = ?, app_install = ?, photo_install = ?, app_return = ?,
       warehouse_spec_return = ?, completed_by_user_id = ?, completed_at = ?
       WHERE document_id = ?`,
      [upNumber || null, executorName || null, user.id, appInstall, photoInstall, appReturn,
        warehouseSpecReturn, confirmed ? user.id : null, confirmed ? new Date() : null, documentId],
    );
    await conn.query("UPDATE documents SET status = ? WHERE id = ?", [nextStatus, documentId]);
    await conn.query(
      `INSERT INTO document_history (document_id, user_id, action, old_status, new_status, comment)
       VALUES (?, ?, 'ACCOUNTING_UPDATE', ?, ?, ?)`,
      [documentId, user.id, doc.status, nextStatus, confirmed ? "Підтверджено виконання" : "Оновлено бухгалтерські поля"],
    );
    await conn.commit();
    if (doc.status !== nextStatus) {
      notifyStatus(user, documentId, doc.status, nextStatus).catch((error) =>
        console.error("TRO status notification failed:", error),
      );
    }
    return { status: nextStatus };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getTroDocumentExtension(executor, documentId) {
  const [[details]] = await executor.query(
    `SELECT t.ta_user_id AS taUserId, ta.user_name AS taName, t.movement_type AS movementType,
       t.up_document_number AS upDocumentNumber, t.executor_name AS executorName,
       t.accountant_user_id AS accountantUserId, t.app_install AS appInstall,
       t.photo_install AS photoInstall, t.app_return AS appReturn,
       t.warehouse_spec_return AS warehouseSpecReturn, t.completed_at AS completedAt
     FROM tro_document_details t JOIN users ta ON ta.id = t.ta_user_id WHERE t.document_id = ?`,
    [documentId],
  );
  const [items] = await executor.query(
    `SELECT i.tro_product_id AS troProductId, i.product_name_snapshot AS productName,
       i.quantity FROM tro_document_items i WHERE i.document_id = ? ORDER BY i.id`,
    [documentId],
  );
  return { ...(details || {}), items };
}
