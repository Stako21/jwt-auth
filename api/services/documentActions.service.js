import pool from "../db.cjs";
import { ROLE_IDS } from "../utils/roles.js";
import { TRO_STATUS_PENDING_SQL } from "../utils/troStatusSync.js";
import { serializeCalendarDate } from "../utils/calendarDate.js";
import { getUserVisibleBranchIds } from "./appConfig.service.js";
import { troAdministrationService, TroAdministrationError } from "./troAdministration.service.js";

const STATUSES = new Set(["NEW", "REVISION", "NOT_COMPLETED", "PLANNED", "COMPLETED", "REJECTED", "CANCELLED"]);
const MAX_SELECTION = 1000;

function assertAdmin(user) {
  if (Number(user?.role) !== ROLE_IDS.Admin || user?.principalType === "integration") {
    throw new TroAdministrationError(403, "TRO_ADMIN_REQUIRED", "Дія доступна тільки адміністратору");
  }
}

function calendarDate(value) {
  if (!value) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new TroAdministrationError(422, "INVALID_DATE", "Некоректна дата");
  }
  return value;
}

export function createDocumentActionsService({
  db = pool, administration = troAdministrationService, visibleBranches = getUserVisibleBranchIds,
} = {}) {
  return {
    async list(user, query = {}) {
      assertAdmin(user);
      const branches = (await visibleBranches(user)).map(Number).filter(Boolean);
      if (!branches.length) throw new TroAdministrationError(403, "TRO_BRANCH_FORBIDDEN", "Немає доступу до філіалу");
      const dateFrom = calendarDate(query.dateFrom);
      const dateTo = calendarDate(query.dateTo);
      if (dateFrom && dateTo && dateFrom > dateTo) throw new TroAdministrationError(422, "INVALID_DATE_RANGE", "Перевірте період");
      const page = Number(query.page || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw new TroAdministrationError(422, "INVALID_PAGE", "Некоректна сторінка");
      const view = query.view || "all";
      if (!["all", "sync-pending"].includes(view)) throw new TroAdministrationError(422, "INVALID_DOCUMENT_VIEW", "Невідомий список документів");
      const where = ["d.document_type = 'TRO'", `d.branch_id IN (${branches.map(() => "?").join(",")})`];
      const params = [...branches];
      if (view === "sync-pending") where.push("td.document_1c_guid IS NOT NULL", TRO_STATUS_PENDING_SQL);
      if (dateFrom) { where.push("d.document_date >= ?"); params.push(dateFrom); }
      if (dateTo) { where.push("d.document_date < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(dateTo); }
      if (query.status) {
        if (!STATUSES.has(query.status)) throw new TroAdministrationError(422, "INVALID_STATUS", "Невідомий статус");
        where.push("d.status = ?"); params.push(query.status);
      }
      const search = String(query.search || "").trim().slice(0, 150);
      if (search) {
        where.push(`(LOCATE(?, d.document_number) > 0 OR LOCATE(?, td.up_document_number) > 0
          OR LOCATE(?, c.name) > 0 OR LOCATE(?, tp.name) > 0 OR EXISTS (
            SELECT 1 FROM tro_1c_execution_documents ex
            WHERE ex.portal_document_id = d.id AND LOCATE(?, ex.document_number) > 0
          ))`);
        params.push(search, search, search, search, search);
      }
      const joins = `FROM documents d JOIN tro_document_details td ON td.document_id = d.id
        LEFT JOIN branches b ON b.id = d.branch_id
        LEFT JOIN cities ci ON ci.id = d.city AND ci.branch_id = d.branch_id
        LEFT JOIN contractors c ON c.id = d.contractor_id AND c.branch_id = d.branch_id
        LEFT JOIN trade_points tp ON tp.id = d.trade_point_id AND tp.branch_id = d.branch_id`;
      const [[count]] = await db.query(`SELECT COUNT(*) AS total ${joins} WHERE ${where.join(" AND ")}`, params);
      const [rows] = await db.query(
        `SELECT d.id, d.document_number, d.document_date, d.status,
          b.name AS branch_name, ci.name AS city_name, c.name AS contractor_name,
          tp.name AS trade_point_name, td.up_document_number, td.one_c_stage,
          td.status_sync_requested_at,
          (td.document_1c_guid IS NOT NULL AND ${TRO_STATUS_PENDING_SQL}) AS sync_pending,
          (td.document_1c_guid IS NOT NULL AND UPPER(td.source_system) = 'UP') AS can_sync
         ${joins} WHERE ${where.join(" AND ")}
         ORDER BY d.document_date DESC, d.id DESC LIMIT ? OFFSET ?`,
        [...params, MAX_SELECTION, (page - 1) * MAX_SELECTION],
      );
      return { data: rows.map((row) => ({ ...row, document_date: serializeCalendarDate(row.document_date) })),
        total: Number(count.total), page, pageSize: MAX_SELECTION };
    },

    async execute(user, payload = {}) {
      assertAdmin(user);
      const { action, documents, comment } = payload;
      if (!["cancel", "revision", "sync", "unsync"].includes(action)) throw new TroAdministrationError(422, "TRO_INVALID_ACTION", "Невідома дія");
      if (typeof comment !== "string" || !comment.trim() || comment.trim().length > 250) {
        throw new TroAdministrationError(422, "TRO_REASON_REQUIRED", "Вкажіть причину (від 1 до 250 символів)");
      }
      if (!Array.isArray(documents) || !documents.length || documents.length > MAX_SELECTION
        || documents.some((item) => !item || !Number.isSafeInteger(item.id) || item.id <= 0 || !STATUSES.has(item.expectedStatus)
          || (action === "unsync" && (typeof item.expectedSyncRequestedAt !== "string" || !Number.isFinite(Date.parse(item.expectedSyncRequestedAt)))))
        || new Set(documents.map((item) => item.id)).size !== documents.length) {
        throw new TroAdministrationError(422, "TRO_INVALID_SELECTION", "Оберіть від 1 до 1000 різних документів із поточними статусами");
      }
      const results = [];
      // Each document has its own locked transaction and branch revalidation.
      // A conflict must not prevent independent selected documents from completing.
      for (const item of documents) {
        try {
          const result = await administration.execute(user, item.id, action, {
            comment, expectedStatus: item.expectedStatus,
            ...(action === "unsync" ? { expectedSyncRequestedAt: item.expectedSyncRequestedAt } : {}),
          });
          results.push({ id: item.id, outcome: result.idempotent ? "unchanged" : "completed", ...result });
        } catch (error) {
          results.push({ id: item.id, outcome: "failed", code: error.status ? error.code : "TRO_ADMIN_FAILED",
            message: error.status ? error.message : "Не вдалося виконати дію з документом" });
        }
      }
      return { results, completed: results.filter((item) => item.outcome === "completed").length,
        unchanged: results.filter((item) => item.outcome === "unchanged").length,
        failed: results.filter((item) => item.outcome === "failed").length };
    },
  };
}

export const documentActionsService = createDocumentActionsService();
