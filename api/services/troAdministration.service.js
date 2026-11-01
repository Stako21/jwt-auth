import pool from "../db.cjs";
import { ROLE_IDS } from "../utils/roles.js";
import { getUserVisibleBranchIds } from "./appConfig.service.js";
import { isTroNaturallyStatusPending } from "../utils/troStatusSync.js";

export class TroAdministrationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const INTEGRATION_FIELDS = [
  "document_1c_guid", "source_system", "one_c_stage", "up_document_number",
  "document_1c_date", "executor_guid", "executor_name", "one_c_sales_agent_id",
  "one_c_sales_agent_guid", "one_c_sales_agent_name", "warehouse_guid",
  "one_c_stage_updated_at", "one_c_observed_at", "last_synced_at", "last_sync_error",
  "rejected_by_1c_guid", "rejected_by_1c_name",
  "status_sync_requested_at",
];
const ACCOUNTING_FIELDS = [
  "accountant_user_id", "completed_by_user_id", "completed_at",
  "app_install", "photo_install", "app_return", "warehouse_spec_return",
];
const REVISION_STATUSES = new Set(["NEW", "REVISION", "NOT_COMPLETED", "REJECTED", "CANCELLED"]);

export function getTroRevisionBlock(doc, hasExecutions = false) {
  if (doc.status === "COMPLETED") return { code: "TRO_ALREADY_COMPLETED", message: "Виконаний документ не можна повернути на доопрацювання" };
  if (doc.status === "PLANNED") return { code: "TRO_ALREADY_PLANNED", message: "Запланований в УП документ не можна повернути на доопрацювання" };
  if (hasExecutions || INTEGRATION_FIELDS.some((field) => Boolean(doc[field]))) {
    return { code: "TRO_PROCESSED_IN_UP", message: "Заявку вже обробляли в УП. Адміністративне повернення на доопрацювання недоступне" };
  }
  if (ACCOUNTING_FIELDS.some((field) => Boolean(doc[field]))) {
    return { code: "TRO_ACCOUNTING_STARTED", message: "Документ має бухгалтерські відмітки. Повернення на доопрацювання недоступне" };
  }
  if (!REVISION_STATUSES.has(doc.status)) return { code: "TRO_INVALID_STATUS", message: "Поточний статус не дозволяє повернення на доопрацювання" };
  return null;
}

async function notifyRevision(user, documentId, oldStatus) {
  const { notifyDocumentStatusChanged } = await import("./notify.service.js");
  return notifyDocumentStatusChanged(user, documentId, oldStatus, "REVISION", "TRO_REVISION");
}

export function createTroAdministrationService({
  db = pool,
  visibleBranches = getUserVisibleBranchIds,
  notify = notifyRevision,
} = {}) {
  async function scope(user, id) {
    if (Number(user?.role) !== ROLE_IDS.Admin || user?.principalType === "integration") {
      throw new TroAdministrationError(403, "TRO_ADMIN_REQUIRED", "Дія доступна тільки адміністратору");
    }
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
      throw new TroAdministrationError(400, "TRO_INVALID_ID", "Некоректний ідентифікатор документа");
    }
    const branches = (await visibleBranches(user)).map(Number).filter(Boolean);
    if (!branches.length) throw new TroAdministrationError(403, "TRO_BRANCH_FORBIDDEN", "Немає доступу до філіалу");
    return branches;
  }

  async function load(executor, id, branches, lock = false) {
    const [[doc]] = await executor.query(
      `SELECT d.id, d.document_type, d.status, d.branch_id, t.*
       FROM documents d JOIN tro_document_details t ON t.document_id = d.id
       WHERE d.id = ? AND d.document_type = 'TRO' AND d.branch_id IN (${branches.map(() => "?").join(",")})
       ${lock ? "FOR UPDATE" : ""}`,
      [Number(id), ...branches],
    );
    if (!doc) throw new TroAdministrationError(404, "TRO_NOT_FOUND", "Документ ТРО не знайдено або немає доступу");
    return doc;
  }

  async function revisionBlock(executor, doc) {
    const [[execution]] = await executor.query(
      "SELECT id FROM tro_1c_execution_documents WHERE portal_document_id = ? LIMIT 1",
      [doc.id],
    );
    return getTroRevisionBlock(doc, Boolean(execution));
  }

  return {
    async options(user, id) {
      const branches = await scope(user, id);
      const doc = await load(db, id, branches);
      const blocked = await revisionBlock(db, doc);
      return {
        canCancel: doc.status !== "CANCELLED",
        canRevise: !blocked && doc.status !== "REVISION",
        revisionBlockedReason: blocked?.message || null,
      };
    },

    async execute(user, id, action, payload = {}) {
      const branches = await scope(user, id);
      if (!["revision", "cancel", "sync"].includes(action)) throw new TroAdministrationError(400, "TRO_INVALID_ACTION", "Невідома адміністративна дія");
      const comment = typeof payload.comment === "string" ? payload.comment.trim() : "";
      if (!comment || comment.length > 250) throw new TroAdministrationError(422, "TRO_REASON_REQUIRED", "Вкажіть причину (від 1 до 250 символів)");
      if (typeof payload.expectedStatus !== "string" || !payload.expectedStatus) {
        throw new TroAdministrationError(422, "TRO_EXPECTED_STATUS_REQUIRED", "Оновіть документ перед виконанням дії");
      }
      const nextStatus = action === "revision" ? "REVISION" : "CANCELLED";
      const conn = await db.getConnection();
      let result;
      let oldStatus;
      let branchId;
      try {
        await conn.beginTransaction();
        const doc = await load(conn, id, branches, true);
        if (action === "sync") {
          if (!doc.document_1c_guid || String(doc.source_system).toUpperCase() !== "UP") {
            throw new TroAdministrationError(409, "TRO_ONE_C_LINK_REQUIRED", "Документ не має зв'язку з УП");
          }
          const [[execution]] = await conn.query(
            "SELECT id FROM tro_1c_execution_documents WHERE portal_document_id = ? LIMIT 1", [doc.id],
          );
          if (doc.status_sync_requested_at || isTroNaturallyStatusPending(doc, Boolean(execution))) {
            await conn.commit();
            return { status: doc.status, idempotent: true, already_pending: true };
          }
          if (doc.status !== payload.expectedStatus) {
            throw new TroAdministrationError(409, "TRO_CONCURRENT_CHANGE", "Статус документа вже змінився. Оновіть документ і повторіть дію");
          }
          await conn.query(
            "UPDATE tro_document_details SET status_sync_requested_at = NOW(3) WHERE document_id = ?", [doc.id],
          );
          await conn.query(
            `INSERT INTO document_history (document_id, user_id, action, old_status, new_status, comment)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [doc.id, user.id, "ADMIN_SYNC_REQUEST", doc.status, doc.status, comment],
          );
          await conn.commit();
          return { status: doc.status, idempotent: false, already_pending: false };
        }
        if (action === "revision") {
          const blocked = await revisionBlock(conn, doc);
          if (blocked) throw new TroAdministrationError(409, blocked.code, blocked.message);
        }
        if (doc.status === nextStatus) {
          await conn.commit();
          return { status: nextStatus, idempotent: true };
        }
        if (doc.status !== payload.expectedStatus) {
          throw new TroAdministrationError(409, "TRO_CONCURRENT_CHANGE", "Статус документа вже змінився. Оновіть документ і повторіть дію");
        }
        const [update] = await conn.query(
          `UPDATE documents SET status = ?${action === "revision" ? ", signed_by_user_id = NULL, signed_at = NULL" : ""}
           WHERE id = ? AND branch_id = ? AND document_type = 'TRO' AND status = ?`,
          [nextStatus, doc.id, doc.branch_id, doc.status],
        );
        if (update.affectedRows !== 1) throw new TroAdministrationError(409, "TRO_CONCURRENT_CHANGE", "Документ вже змінився. Оновіть документ");
        await conn.query(
          `INSERT INTO document_history (document_id, user_id, action, old_status, new_status, comment)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [doc.id, user.id, action === "revision" ? "ADMIN_REVISION" : "ADMIN_CANCEL", doc.status, nextStatus, comment],
        );
        await conn.commit();
        oldStatus = doc.status;
        branchId = doc.branch_id;
        result = { status: nextStatus, idempotent: false };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
      if (action === "revision") {
        Promise.resolve().then(() => notify({ ...user, branchId }, Number(id), oldStatus)).catch(() =>
          console.error("TRO administrative revision notification failed"),
        );
      }
      return result;
    },
  };
}

export const troAdministrationService = createTroAdministrationService();
