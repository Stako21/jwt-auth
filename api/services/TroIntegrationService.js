import crypto from "node:crypto";
import TroIntegrationRepository from "../repositories/TroIntegration.js";

const MOVEMENTS = new Set(["INSTALL", "RETURN"]);
const STAGES = new Set(["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR_VERSION = 1;

export class IntegrationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function clean(value, maxLength) {
  const result = String(value ?? "").trim();
  if (result.length > maxLength) {
    throw new IntegrationError(422, "VALUE_TOO_LONG", `Значення перевищує ${maxLength} символів`);
  }
  return result;
}

function guid(value, field, required = true) {
  const result = clean(value, 36).toLowerCase();
  if (!result && !required) return null;
  if (!GUID_PATTERN.test(result)) {
    throw new IntegrationError(422, "INVALID_GUID", `Некоректне поле ${field}`);
  }
  return result;
}

function date(value, field, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new IntegrationError(422, "INVALID_DATE", `Некоректне поле ${field}`);
  }
  result.setMilliseconds(0);
  return result;
}

function limit(value) {
  const parsed = Number(value || 100);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new IntegrationError(422, "INVALID_LIMIT", "limit має бути від 1 до 500");
  }
  return parsed;
}

function sameDate(left, right) {
  if (!left && !right) return true;
  return new Date(left).getTime() === new Date(right).getTime();
}

function stageLabel(stage) {
  return ({ NEW: "Новий", IN_PROGRESS: "Виконується", COMPLETED: "Завершено", CANCELLED: "Скасовано" })[stage] || stage;
}

function parseExecutionDocuments(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "execution_documents")) {
    return null;
  }
  if (!Array.isArray(payload.execution_documents)) {
    throw new IntegrationError(422, "INVALID_EXECUTION_DOCUMENTS", "execution_documents має бути масивом");
  }
  const seen = new Set();
  return payload.execution_documents.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new IntegrationError(422, "INVALID_EXECUTION_DOCUMENT", `Некоректний execution_documents[${index}]`);
    }
    const documentGuid = guid(item.document_1c_guid, `execution_documents[${index}].document_1c_guid`);
    if (seen.has(documentGuid)) {
      throw new IntegrationError(422, "DUPLICATE_EXECUTION_DOCUMENT_GUID", `GUID ${documentGuid} повторюється в execution_documents`);
    }
    seen.add(documentGuid);
    const documentNumber = clean(item.document_number, 64);
    if (!documentNumber) {
      throw new IntegrationError(422, "INVALID_EXECUTION_DOCUMENT_NUMBER", `Порожній номер у execution_documents[${index}]`);
    }
    if (typeof item.confirmed !== "boolean" || typeof item.shipped_from_warehouse !== "boolean") {
      throw new IntegrationError(422, "INVALID_EXECUTION_DOCUMENT_FLAGS", `Прапорці execution_documents[${index}] мають бути boolean`);
    }
    return {
      documentGuid,
      documentNumber,
      documentDate: date(item.document_date, `execution_documents[${index}].document_date`),
      confirmed: item.confirmed,
      shippedFromWarehouse: item.shipped_from_warehouse,
    };
  });
}

function executionDocumentsEqual(existing, incoming) {
  if (existing.length !== incoming.length) return false;
  const byGuid = new Map(existing.map((item) => [String(item.document_1c_guid).toLowerCase(), item]));
  return incoming.every((item) => {
    const current = byGuid.get(item.documentGuid);
    return current
      && current.document_number === item.documentNumber
      && sameDate(current.document_date, item.documentDate)
      && Boolean(current.confirmed) === item.confirmed
      && Boolean(current.shipped_from_warehouse) === item.shippedFromWarehouse;
  });
}

function rejectionComment({ reason, reasonCode, responsibleName }) {
  return [
    "Заявку відхилено в УП.",
    `Відповідальний: ${responsibleName}.`,
    `Причина: ${reason}.`,
    `Код причини: ${reasonCode || "—"}.`,
  ].join("\n");
}

function cursorTuple(createdAt, id) {
  const parsedDate = new Date(createdAt);
  const parsedId = Number(id);
  if (Number.isNaN(parsedDate.getTime()) || !Number.isInteger(parsedId) || parsedId < 1) {
    throw new IntegrationError(422, "INVALID_CURSOR", "Некоректний cursor");
  }
  return { createdAt: parsedDate, id: parsedId };
}

export function createTroIntegrationService(
  repository = TroIntegrationRepository,
  notify = async () => {},
  options = {},
) {
  const cursorSecret = options.cursorSecret || process.env.ACCESS_TOKEN_SECRET;

  function cursorScope(kind, accessibleBranchIds, accessibleCityIds, movementType = null) {
    return crypto.createHash("sha256").update(JSON.stringify({
      kind,
      branchIds: [...accessibleBranchIds].map(Number).sort((left, right) => left - right),
      cityIds: [...accessibleCityIds].map(Number).sort((left, right) => left - right),
      movementType,
    })).digest("base64url");
  }

  function encodeCursor(payload) {
    if (!cursorSecret) {
      throw new IntegrationError(500, "CURSOR_CONFIGURATION_ERROR", "Не налаштовано секрет cursor");
    }
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", cursorSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  function decodeCursor(value, kind, scope) {
    try {
      if (!cursorSecret || typeof value !== "string" || value.length > 4096) throw new Error();
      const parts = value.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error();
      const expected = crypto.createHmac("sha256", cursorSecret).update(parts[0]).digest();
      const received = Buffer.from(parts[1], "base64url");
      if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new Error();
      const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      if (payload?.v !== CURSOR_VERSION || payload.kind !== kind || payload.scope !== scope) throw new Error();
      return {
        after: cursorTuple(payload.after?.createdAt, payload.after?.id),
        ceiling: cursorTuple(payload.ceiling?.createdAt, payload.ceiling?.id),
      };
    } catch {
      throw new IntegrationError(422, "INVALID_CURSOR", "Некоректний cursor");
    }
  }

  async function paginate({ kind, scope, rawCursor, pageLimit, getCeiling, getRows, rowTuple }) {
    const decoded = rawCursor ? decodeCursor(rawCursor, kind, scope) : null;
    const ceiling = decoded?.ceiling || await getCeiling();
    if (!ceiling) {
      return { rows: [], pagination: { next_cursor: null, has_more: false } };
    }

    const rows = await getRows({
      after: decoded?.after || null,
      ceiling,
      limit: pageLimit + 1,
    });
    const hasMore = rows.length > pageLimit;
    const page = rows.slice(0, pageLimit);
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? encodeCursor({
        v: CURSOR_VERSION,
        kind,
        scope,
        after: rowTuple(last),
        ceiling: cursorTuple(ceiling.createdAt, ceiling.id),
      })
      : null;
    return { rows: page, pagination: { next_cursor: nextCursor, has_more: hasMore } };
  }

  async function accessScope(user, requestedBranchId) {
    const accessible = Array.isArray(user.branchIds)
      ? user.branchIds.map(Number)
      : await repository.getAccessibleBranchIds(user.id, user.branchId);
    const cityIds = Array.isArray(user.cityIds) ? user.cityIds.map(Number) : [];
    if (!requestedBranchId) return { branchIds: accessible, cityIds };
    const requested = Number(requestedBranchId);
    if (!accessible.includes(requested)) {
      throw new IntegrationError(403, "BRANCH_ACCESS_DENIED", "Філія недоступна");
    }
    return { branchIds: [requested], cityIds };
  }

  function normalizeScope(scope) {
    return Array.isArray(scope) ? { branchIds: scope, cityIds: [] } : scope;
  }

  function assertDocument(doc, rawScope) {
    const { branchIds: accessibleBranchIds, cityIds: accessibleCityIds } = normalizeScope(rawScope);
    if (!doc) throw new IntegrationError(404, "DOCUMENT_NOT_FOUND", "Документ не знайдено");
    if (doc.document_type !== "TRO" || !MOVEMENTS.has(doc.movement_type)) {
      throw new IntegrationError(422, "INVALID_DOCUMENT_TYPE", "Документ не є заявкою ТРО");
    }
    if (!accessibleBranchIds.includes(Number(doc.branch_id))) {
      throw new IntegrationError(403, "BRANCH_ACCESS_DENIED", "Філія недоступна");
    }
    if (accessibleCityIds.length && !accessibleCityIds.includes(Number(doc.city))) {
      throw new IntegrationError(403, "CITY_ACCESS_DENIED", "Місто документа недоступне");
    }
  }

  async function resolveAgent(connection, doc, agentGuid, agentName, identity = {}) {
    const matches = await repository.findSalesAgents(connection, doc.branch_id, agentGuid, identity);
    if (matches.length === 0) {
      return { id: null, warning: `Торгового агента ${agentGuid} не знайдено у довіднику` };
    }
    if (matches.length === 1) return { id: matches[0].id, warning: null };
    const normalizedName = agentName.toLocaleLowerCase("uk");
    const named = matches.filter((row) =>
      [row.full_name, row.user_name].some(
        (value) => String(value || "").trim().toLocaleLowerCase("uk") === normalizedName,
      ));
    if (named.length === 1) {
      return { id: named[0].id, warning: null };
    }
    throw new IntegrationError(422, "AMBIGUOUS_SALES_AGENT", "GUID відповідає кільком торговим агентам");
  }

  return {
    async listReady(user, query = {}) {
      const movementType = query.movement_type ? clean(query.movement_type, 16).toUpperCase() : null;
      if (movementType && !MOVEMENTS.has(movementType)) {
        throw new IntegrationError(422, "INVALID_MOVEMENT_TYPE", "Невідомий movement_type");
      }
      const scopeAccess = normalizeScope(await accessScope(user, query.branch_id));
      const { branchIds: accessibleBranchIds, cityIds: accessibleCityIds } = scopeAccess;
      const pageLimit = limit(query.limit);
      const scope = cursorScope("ready", accessibleBranchIds, accessibleCityIds, movementType);
      const { rows, pagination } = await paginate({
        kind: "ready",
        scope,
        rawCursor: query.cursor,
        pageLimit,
        getCeiling: () => repository.getReadyCeiling({
          branchIds: accessibleBranchIds,
          cityIds: accessibleCityIds,
          movementType,
        }),
        getRows: ({ after, ceiling, limit: fetchLimit }) => repository.listReady({
          branchIds: accessibleBranchIds,
          cityIds: accessibleCityIds,
          movementType,
          after,
          ceiling,
          limit: fetchLimit,
        }),
        rowTuple: (row) => cursorTuple(row.created_at, row.id),
      });
      const items = await repository.getItems(rows.map((row) => row.id));
      const byDocument = new Map();
      for (const item of items) {
        if (!byDocument.has(Number(item.document_id))) byDocument.set(Number(item.document_id), []);
        byDocument.get(Number(item.document_id)).push({
          product_guid: item.product_guid,
          product_name: item.product_name,
          quantity: Number(item.quantity),
        });
      }
      return { data: rows.map((row) => ({
        portal_document_id: row.id,
        portal_document_number: row.document_number,
        portal_created_at: row.created_at,
        movement_type: row.movement_type,
        branch: { id: row.branch_id, name: row.branch_name },
        city: { id: row.city_id, name: row.city_name },
        trade_point: { guid: row.trade_point_guid, name: row.trade_point_name, address: row.trade_point_address },
        contractor: { guid: row.contractor_guid, name: row.contractor_name },
        request_sales_agent: {
          id: row.request_sales_agent_id || null,
          guid: row.request_agent_guid,
          name: row.request_agent_name,
          login: row.request_agent_login || null,
          route_guid: row.request_route_guid || null,
          route_name: row.request_route_name || null,
          assortment_guid: row.request_assortment_guid || null,
          assortment_name: row.request_assortment_name || null,
          source: row.request_agent_source || "LEGACY",
        },
        items: byDocument.get(Number(row.id)) || [],
        comment: row.comment,
        status: row.status,
        updated_at: row.updated_at,
      })), pagination };
    },

    async created(user, documentId, payload) {
      const accessible = normalizeScope(await accessScope(user));
      const portalNumber = clean(payload.portal_document_number, 20);
      const documentGuid = guid(payload.document_1c_guid, "document_1c_guid");
      const documentNumber = clean(payload.document_1c_number, 20);
      const documentDate = date(payload.document_1c_date, "document_1c_date");
      const responsibleGuid = guid(payload.responsible_guid, "responsible_guid");
      const responsibleName = clean(payload.responsible_name, 150);
      const salesAgentGuid = guid(payload.sales_agent_guid, "sales_agent_guid");
      const salesAgentName = clean(payload.sales_agent_name, 150);
      const salesAgentLogin = payload.sales_agent_login === undefined
        ? null : clean(payload.sales_agent_login, 50).toLowerCase();
      const salesAgentRouteGuid = guid(payload.sales_agent_route_guid, "sales_agent_route_guid", false);
      const salesAgentAssortmentGuid = guid(payload.sales_agent_assortment_guid, "sales_agent_assortment_guid", false);
      const sourceSystem = clean(payload.source_system || "UP", 32).toUpperCase();
      const warehouseGuid = guid(payload.warehouse_guid, "warehouse_guid", false);
      if (!portalNumber || !documentNumber || !responsibleName || !salesAgentName || !sourceSystem) {
        throw new IntegrationError(422, "REQUIRED_FIELD_MISSING", "Не всі обов'язкові поля заповнено");
      }

      let result;
      try {
        result = await repository.transaction(async (connection) => {
          const doc = await repository.lockDocument(connection, Number(documentId));
          assertDocument(doc, accessible);
          if (doc.document_number !== portalNumber) {
            throw new IntegrationError(409, "PORTAL_NUMBER_MISMATCH", "Номер документа порталу не відповідає id");
          }
          if (doc.document_1c_guid) {
            const equivalentLink = doc.document_1c_guid.toLowerCase() === documentGuid
              && String(doc.source_system).toUpperCase() === sourceSystem;
            const equivalentDocument = doc.up_document_number === documentNumber
              && sameDate(doc.document_1c_date, documentDate)
              && String(doc.warehouse_guid || "").toLowerCase() === String(warehouseGuid || "").toLowerCase();
            if (!equivalentLink || !equivalentDocument) {
              throw new IntegrationError(409, "DOCUMENT_ALREADY_LINKED", "Документ уже пов'язаний з іншим документом 1С");
            }
            const agent = await resolveAgent(
              connection,
              doc,
              salesAgentGuid,
              salesAgentName,
              { login: salesAgentLogin, routeGuid: salesAgentRouteGuid, assortmentGuid: salesAgentAssortmentGuid },
            );
            await repository.updateCreatedMetadata(connection, {
              documentId: doc.id,
              responsibleName,
              responsibleGuid,
              salesAgentId: agent.id,
              salesAgentGuid,
              salesAgentName,
              warning: agent.warning,
            });
            return {
              idempotent: true,
              portal_status: doc.status,
              one_c_stage: doc.one_c_stage,
              warning: agent.warning,
            };
          }
          if (doc.status !== "NOT_COMPLETED") {
            throw new IntegrationError(409, "INVALID_PORTAL_STATUS", "Документ не готовий до створення в 1С");
          }
          const existing = await repository.findDocumentByExternalGuid(connection, sourceSystem, documentGuid);
          if (existing && Number(existing.document_id) !== Number(doc.id)) {
            throw new IntegrationError(409, "ONE_C_DOCUMENT_ALREADY_LINKED", "GUID документа 1С вже використовується");
          }
          const agent = await resolveAgent(connection, doc, salesAgentGuid, salesAgentName, {
            login: salesAgentLogin,
            routeGuid: salesAgentRouteGuid,
            assortmentGuid: salesAgentAssortmentGuid,
          });
          await repository.saveCreated(connection, {
            documentId: doc.id,
            documentGuid,
            documentDate,
            sourceSystem,
            documentNumber,
            responsibleName,
            responsibleGuid,
            salesAgentId: agent.id,
            salesAgentGuid,
            salesAgentName,
            warehouseGuid,
            warning: agent.warning,
          });
          await repository.addHistory(connection, {
            documentId: doc.id,
            userId: null,
            action: "ONE_C_CREATED",
            oldStatus: doc.status,
            newStatus: "PLANNED",
            comment: `Створено документ УП ${documentNumber}. Виконавець: ${responsibleName}. ТА: ${salesAgentName}.`,
          });
          return { idempotent: false, portal_status: "PLANNED", one_c_stage: "NEW", warning: agent.warning, notification_branch_id: doc.branch_id };
        });
      } catch (error) {
        if (error?.code === "ER_DUP_ENTRY") {
          throw new IntegrationError(409, "ONE_C_DOCUMENT_ALREADY_LINKED", "GUID документа 1С вже використовується");
        }
        throw error;
      }
      if (!result.idempotent) {
        notify({ ...user, id: 0, role: 1, branchId: result.notification_branch_id }, Number(documentId), "NOT_COMPLETED", "PLANNED", "TRO_PLANNED").catch((error) =>
          console.error("1C created status notification failed:", error));
      }
      const response = { ...result };
      delete response.notification_branch_id;
      return response;
    },

    async rejected(user, documentId, payload) {
      const accessible = normalizeScope(await accessScope(user));
      const reason = clean(payload.reason, 250);
      const reasonCode = clean(payload.reason_code, 64);
      const responsibleGuid = guid(payload.responsible_guid, "responsible_guid");
      if (typeof payload.responsible_name !== "string") {
        throw new IntegrationError(422, "INVALID_RESPONSIBLE_NAME", "Некоректне поле responsible_name");
      }
      const responsibleName = clean(payload.responsible_name, 150);
      if (!reason) throw new IntegrationError(422, "REASON_REQUIRED", "Вкажіть причину відхилення");
      if (!responsibleName) {
        throw new IntegrationError(422, "RESPONSIBLE_NAME_REQUIRED", "Вкажіть відповідального 1С");
      }
      const comment = rejectionComment({ reason, reasonCode, responsibleName });
      const result = await repository.transaction(async (connection) => {
        const doc = await repository.lockDocument(connection, Number(documentId));
        assertDocument(doc, accessible);
        if (doc.document_1c_guid) {
          throw new IntegrationError(409, "DOCUMENT_ALREADY_LINKED", "Пов'язаний документ не можна відхилити цим endpoint");
        }
        if (doc.status === "REJECTED") {
          const previous = await repository.getLastHistoryComment(connection, doc.id, "ONE_C_REJECTED");
          const sameResponsible = String(doc.rejected_by_1c_guid || "").toLowerCase() === responsibleGuid
            && String(doc.rejected_by_1c_name || "").trim() === responsibleName;
          if (previous === comment && sameResponsible) {
            return { idempotent: true, portal_status: "REJECTED" };
          }
          throw new IntegrationError(409, "DOCUMENT_ALREADY_REJECTED", "Документ уже відхилено з іншою причиною або іншим відповідальним");
        }
        if (doc.status !== "NOT_COMPLETED") {
          throw new IntegrationError(409, "INVALID_PORTAL_STATUS", "Документ не можна відхилити у поточному статусі");
        }
        await repository.reject(connection, {
          documentId: doc.id,
          responsibleGuid,
          responsibleName,
        });
        await repository.addHistory(connection, {
          documentId: doc.id, userId: null, action: "ONE_C_REJECTED",
          oldStatus: doc.status, newStatus: "REJECTED", comment,
        });
        return { idempotent: false, portal_status: "REJECTED", notification_branch_id: doc.branch_id };
      });
      if (!result.idempotent) {
        notify({ ...user, id: 0, role: 1, branchId: result.notification_branch_id }, Number(documentId), "NOT_COMPLETED", "REJECTED", "TRO_REJECTED_IN_UP").catch((error) =>
          console.error("1C rejected status notification failed:", error));
      }
      const response = { ...result };
      delete response.notification_branch_id;
      return response;
    },

    async listPending(user, query = {}) {
      const scopeAccess = normalizeScope(await accessScope(user, query.branch_id));
      const { branchIds: accessibleBranchIds, cityIds: accessibleCityIds } = scopeAccess;
      const pageLimit = limit(query.limit);
      const scope = cursorScope("status-pending", accessibleBranchIds, accessibleCityIds);
      const { rows, pagination } = await paginate({
        kind: "status-pending",
        scope,
        rawCursor: query.cursor,
        pageLimit,
        getCeiling: () => repository.getPendingCeiling({ branchIds: accessibleBranchIds, cityIds: accessibleCityIds }),
        getRows: ({ after, ceiling, limit: fetchLimit }) => repository.listPending({
          branchIds: accessibleBranchIds,
          cityIds: accessibleCityIds,
          after,
          ceiling,
          limit: fetchLimit,
        }),
        rowTuple: (row) => cursorTuple(row.cursor_created_at, row.id),
      });
      return { data: rows.map((row) => ({
        portal_document_id: row.id,
        portal_document_number: row.document_number,
        movement_type: row.movement_type,
        document_1c_guid: row.document_1c_guid,
        source_system: row.source_system,
        one_c_stage: row.one_c_stage,
        one_c_stage_updated_at: row.one_c_stage_updated_at,
        city: { id: row.city_id, name: row.city_name },
      })), pagination };
    },

    async stage(user, documentId, payload) {
      const accessible = normalizeScope(await accessScope(user));
      const documentGuid = guid(payload.document_1c_guid, "document_1c_guid");
      const sourceSystem = clean(payload.source_system || "UP", 32).toUpperCase();
      const nextStage = clean(payload.stage, 32).toUpperCase();
      const changedAt = date(payload.changed_at, "changed_at");
      const executionDocuments = parseExecutionDocuments(payload);
      if (!STAGES.has(nextStage)) {
        throw new IntegrationError(422, "INVALID_ONE_C_STAGE", "Невідомий стан документа 1С");
      }
      const result = await repository.transaction(async (connection) => {
        const doc = await repository.lockDocument(connection, Number(documentId));
        assertDocument(doc, accessible);
        if (!doc.document_1c_guid
          || doc.document_1c_guid.toLowerCase() !== documentGuid
          || String(doc.source_system).toUpperCase() !== sourceSystem) {
          throw new IntegrationError(409, "ONE_C_LINK_MISMATCH", "Зв'язок з документом 1С не відповідає запиту");
        }
        const stageChanged = doc.one_c_stage !== nextStage;
        const observationBarrier = executionDocuments === null
          ? doc.one_c_stage_updated_at
          : (doc.one_c_observed_at || doc.one_c_stage_updated_at);
        if ((stageChanged || executionDocuments !== null)
          && observationBarrier
          && changedAt < new Date(observationBarrier)) {
          throw new IntegrationError(409, "STALE_STAGE_UPDATE", "Отримано застарілу зміну стану 1С");
        }

        let executionDocumentsChanged = false;
        let existingExecutionDocuments = [];
        if (executionDocuments !== null) {
          existingExecutionDocuments = await repository.getExecutionDocuments(connection, doc.id, true);
          executionDocumentsChanged = !executionDocumentsEqual(existingExecutionDocuments, executionDocuments);
          const conflicts = await repository.findExecutionDocumentConflicts(
            connection,
            sourceSystem,
            executionDocuments.map((item) => item.documentGuid),
            doc.id,
          );
          if (conflicts.length) {
            throw new IntegrationError(409, "EXECUTION_DOCUMENT_GUID_CONFLICT", "Документ виконання 1С вже пов'язаний з іншою заявкою Portal");
          }
        }

        const observationChanged = executionDocuments !== null
          && !sameDate(doc.one_c_observed_at || doc.one_c_stage_updated_at, changedAt);
        // Only a complete, explicitly empty snapshot can finalize cancellation.
        // Legacy payloads must never infer absence from omitted execution data.
        const cancelPortalRequest = doc.status === "PLANNED"
          && nextStage === "CANCELLED"
          && executionDocuments !== null
          && executionDocuments.length === 0;
        // A GET or a legacy callback without a full snapshot must not consume the request.
        // This also handles an otherwise identical terminal snapshot.
        if (doc.status_sync_requested_at && executionDocuments !== null
          && changedAt >= new Date(doc.status_sync_requested_at)) {
          await repository.acknowledgeStatusSyncRequest(connection, doc.id);
        }
        if (!stageChanged && !executionDocumentsChanged && !observationChanged && !cancelPortalRequest) {
          return {
            idempotent: true,
            stage_changed: false,
            execution_documents_changed: false,
            portal_status: doc.status,
            one_c_stage: doc.one_c_stage,
          };
        }

        if (executionDocumentsChanged) {
          try {
            await repository.syncExecutionDocuments(
              connection,
              doc.id,
              sourceSystem,
              executionDocuments,
              existingExecutionDocuments,
            );
          } catch (error) {
            if (error?.code === "ER_DUP_ENTRY") {
              throw new IntegrationError(409, "EXECUTION_DOCUMENT_GUID_CONFLICT", "Документ виконання 1С вже пов'язаний з іншою заявкою Portal");
            }
            throw error;
          }
        }
        if (executionDocuments !== null) {
          await repository.saveStageObservation(connection, doc.id, nextStage, changedAt, stageChanged);
        } else if (stageChanged) {
          await repository.saveStage(connection, doc.id, nextStage, changedAt);
        }
        const comments = [];
        if (stageChanged) {
          comments.push(`Стан документа в УП змінено: ${stageLabel(doc.one_c_stage || "NEW")} → ${stageLabel(nextStage)}.`);
        }
        if (comments.length) {
          await repository.addHistory(connection, {
            documentId: doc.id, userId: null, action: "ONE_C_STAGE",
            oldStatus: null,
            newStatus: null,
            comment: comments.join(" "),
          });
        }
        if (cancelPortalRequest) {
          await repository.cancelPlanned(connection, doc.id, doc.branch_id);
          await repository.addHistory(connection, {
            documentId: doc.id, userId: null, action: "ONE_C_CANCELLED",
            oldStatus: doc.status,
            newStatus: "CANCELLED",
            comment: "Заявку скасовано в УП. Повний знімок 1С підтвердив відсутність активних документів виконання.",
          });
        }
        return {
          idempotent: false,
          stage_changed: stageChanged,
          execution_documents_changed: executionDocumentsChanged,
          portal_status: cancelPortalRequest ? "CANCELLED" : doc.status,
          one_c_stage: nextStage,
        };
      });
      return result;
    },
  };
}

async function notifyStatus(user, documentId, oldStatus, newStatus, eventCode) {
  const { notifyDocumentStatusChanged } = await import("./notify.service.js");
  return notifyDocumentStatusChanged(user, documentId, oldStatus, newStatus, eventCode);
}

const service = createTroIntegrationService(TroIntegrationRepository, notifyStatus);
export default service;
