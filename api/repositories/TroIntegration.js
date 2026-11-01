import pool from "../db.cjs";
import { TRO_STATUS_PENDING_SQL } from "../utils/troStatusSync.js";

export default class TroIntegrationRepository {
  static async getAccessibleBranchIds(userId, primaryBranchId) {
    const [rows] = await pool.query(
      "SELECT branch_id FROM user_branch_access WHERE user_id = ?",
      [userId],
    );
    return [...new Set([Number(primaryBranchId), ...rows.map((row) => Number(row.branch_id))])]
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  static buildReadyWhere({ branchIds, cityIds = [], movementType, after, ceiling }) {
    const params = [...branchIds];
    const where = [
      "d.document_type = 'TRO'",
      "d.status = 'NOT_COMPLETED'",
      `d.branch_id IN (${branchIds.map(() => "?").join(", ")})`,
    ];
    if (cityIds.length) {
      where.push(`d.city IN (${cityIds.map(() => "?").join(", ")})`);
      params.push(...cityIds);
    }
    if (movementType) {
      where.push("td.movement_type = ?");
      params.push(movementType);
    }

    if (ceiling) {
      where.push("(d.created_at < ? OR (d.created_at = ? AND d.id <= ?))");
      params.push(ceiling.createdAt, ceiling.createdAt, ceiling.id);
    }

    if (after) {
      where.push("(d.created_at > ? OR (d.created_at = ? AND d.id > ?))");
      params.push(after.createdAt, after.createdAt, after.id);
    }

    return { where, params };
  }

  static async getReadyCeiling({ branchIds, cityIds, movementType }) {
    const { where, params } = this.buildReadyWhere({ branchIds, cityIds, movementType });
    const [[row]] = await pool.query(
      `SELECT d.created_at, d.id
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
       WHERE ${where.join(" AND ")}
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 1`,
      params,
    );
    return row ? { createdAt: row.created_at, id: Number(row.id) } : null;
  }

  static async listReady({ branchIds, cityIds, movementType, after, ceiling, limit }) {
    const { where, params } = this.buildReadyWhere({
      branchIds,
      cityIds,
      movementType,
      after,
      ceiling,
    });
    params.push(limit);
    const [rows] = await pool.query(
      `SELECT d.id, d.document_number, d.created_at, d.updated_at, d.status, d.comment,
              d.branch_id, b.name AS branch_name, d.city AS city_id,
              ci.name AS city_name, td.movement_type,
              tp.id_1c AS trade_point_guid, tp.name AS trade_point_name,
              tp.address AS trade_point_address,
              c.id_1c AS contractor_guid, c.name AS contractor_name,
              COALESCE(td.request_agent_guid, ta.current_agent_guid) AS request_agent_guid,
              COALESCE(td.request_agent_name, ta.user_name) AS request_agent_name,
              td.request_sales_agent_id, td.request_agent_login,
              td.request_route_guid, td.request_route_name,
              td.request_assortment_guid, td.request_assortment_name,
              CASE WHEN td.request_sales_agent_id IS NULL THEN 'LEGACY' ELSE 'SNAPSHOT' END AS request_agent_source
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
       JOIN branches b ON b.id = d.branch_id
       LEFT JOIN cities ci ON ci.id = d.city AND ci.branch_id = d.branch_id
       JOIN trade_points tp ON tp.id = d.trade_point_id
       JOIN contractors c ON c.id = d.contractor_id
       JOIN users ta ON ta.id = td.ta_user_id
       WHERE ${where.join(" AND ")}
       ORDER BY d.created_at, d.id
       LIMIT ?`,
      params,
    );
    return rows;
  }

  static async getItems(documentIds) {
    if (!documentIds.length) return [];
    const [rows] = await pool.query(
      `SELECT i.document_id, p.id_1c AS product_guid,
              i.product_name_snapshot AS product_name, i.quantity
       FROM tro_document_items i
       JOIN tro_products p ON p.id = i.tro_product_id
       WHERE i.document_id IN (?)
       ORDER BY i.document_id, i.id`,
      [documentIds],
    );
    return rows;
  }

  static buildPendingWhere({ branchIds, cityIds = [], after, ceiling }) {
    const where = [
      "d.document_type = 'TRO'",
      `d.branch_id IN (${branchIds.map(() => "?").join(", ")})`,
      "td.document_1c_guid IS NOT NULL",
      TRO_STATUS_PENDING_SQL,
    ];
    const params = [...branchIds];
    if (cityIds.length) {
      where.push(`d.city IN (${cityIds.map(() => "?").join(", ")})`);
      params.push(...cityIds);
    }

    if (ceiling) {
      where.push("(d.created_at < ? OR (d.created_at = ? AND d.id <= ?))");
      params.push(ceiling.createdAt, ceiling.createdAt, ceiling.id);
    }

    if (after) {
      where.push("(d.created_at > ? OR (d.created_at = ? AND d.id > ?))");
      params.push(after.createdAt, after.createdAt, after.id);
    }

    return { where, params };
  }

  static async getPendingCeiling({ branchIds, cityIds }) {
    const { where, params } = this.buildPendingWhere({ branchIds, cityIds });
    const [[row]] = await pool.query(
      `SELECT d.created_at, d.id
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
       WHERE ${where.join(" AND ")}
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 1`,
      params,
    );
    return row ? { createdAt: row.created_at, id: Number(row.id) } : null;
  }

  static async listPending({ branchIds, cityIds, after, ceiling, limit }) {
    const { where, params } = this.buildPendingWhere({ branchIds, cityIds, after, ceiling });
    params.push(limit);
    const [rows] = await pool.query(
      `SELECT d.id, d.document_number, td.movement_type, td.document_1c_guid,
              td.source_system, td.one_c_stage, td.one_c_stage_updated_at,
              d.created_at AS cursor_created_at, d.city AS city_id, ci.name AS city_name
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
       LEFT JOIN cities ci ON ci.id = d.city AND ci.branch_id = d.branch_id
       WHERE ${where.join(" AND ")}
       ORDER BY d.created_at, d.id
       LIMIT ?`,
      params,
    );
    return rows;
  }

  static async transaction(work) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async lockDocument(connection, documentId) {
    const [[row]] = await connection.query(
      `SELECT d.id, d.document_number, d.document_type, d.status, d.author_user_id,
              d.branch_id, d.city, td.ta_user_id, td.movement_type, td.up_document_number,
              td.executor_name, td.executor_guid, td.document_1c_guid, td.document_1c_date,
              td.source_system, td.one_c_sales_agent_id, td.one_c_sales_agent_guid,
              td.one_c_sales_agent_name,
              td.warehouse_guid, td.one_c_stage, td.one_c_stage_updated_at,
              td.one_c_observed_at, td.status_sync_requested_at,
              td.last_sync_error, td.rejected_by_1c_guid, td.rejected_by_1c_name
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
       WHERE d.id = ?
       FOR UPDATE`,
      [documentId],
    );
    return row || null;
  }

  static async findDocumentByExternalGuid(connection, sourceSystem, guid) {
    const [[row]] = await connection.query(
      `SELECT document_id FROM tro_document_details
       WHERE source_system = ? AND document_1c_guid = ? LIMIT 1`,
      [sourceSystem, guid],
    );
    return row || null;
  }

  static async findSalesAgents(connection, branchId, guid, identity = {}) {
    const conditions = [
      "sa.branch_id = ?", "u.branch_id = ?", "u.is_active = 1",
      "LOWER(sa.current_agent_guid) = ?",
    ];
    const params = [branchId, branchId, guid];
    if (identity.routeGuid) {
      conditions.push("LOWER(sa.route_guid) = ?");
      params.push(identity.routeGuid);
    } else if (identity.login) {
      conditions.push("LOWER(sa.login) = ?");
      params.push(identity.login);
    }
    if (identity.assortmentGuid) {
      conditions.push("LOWER(sa.assortment_guid) = ?");
      params.push(identity.assortmentGuid);
    }
    const [rows] = await connection.query(
      `SELECT sa.id, sa.user_id, sa.full_name, u.user_name, sa.login,
              sa.route_guid, sa.assortment_guid
       FROM sales_agents sa
       JOIN users u ON u.id = sa.user_id
       WHERE ${conditions.join(" AND ")}`,
      params,
    );
    return rows;
  }

  static async saveCreated(connection, values) {
    await connection.query(
      `UPDATE tro_document_details
       SET document_1c_guid = ?, document_1c_date = ?, source_system = ?,
           up_document_number = ?, executor_name = ?, executor_guid = ?,
           one_c_sales_agent_id = ?, one_c_sales_agent_guid = ?,
           one_c_sales_agent_name = ?, warehouse_guid = ?, one_c_stage = 'NEW',
           one_c_stage_updated_at = NOW(), last_synced_at = NOW(), last_sync_error = ?
       WHERE document_id = ?`,
      [
        values.documentGuid, values.documentDate, values.sourceSystem,
        values.documentNumber, values.responsibleName, values.responsibleGuid,
        values.salesAgentId, values.salesAgentGuid, values.salesAgentName,
        values.warehouseGuid, values.warning, values.documentId,
      ],
    );
    await connection.query(
      "UPDATE documents SET status = 'PLANNED' WHERE id = ? AND status = 'NOT_COMPLETED'",
      [values.documentId],
    );
  }

  static async updateCreatedMetadata(connection, values) {
    await connection.query(
      `UPDATE tro_document_details
       SET executor_name = ?, executor_guid = ?, one_c_sales_agent_id = ?,
           one_c_sales_agent_guid = ?, one_c_sales_agent_name = ?,
           last_synced_at = NOW(), last_sync_error = ?
       WHERE document_id = ?`,
      [
        values.responsibleName,
        values.responsibleGuid,
        values.salesAgentId,
        values.salesAgentGuid,
        values.salesAgentName,
        values.warning,
        values.documentId,
      ],
    );
  }

  static async saveStage(connection, documentId, stage, changedAt) {
    await connection.query(
      `UPDATE tro_document_details
       SET one_c_stage = ?, one_c_stage_updated_at = ?, last_synced_at = NOW(),
           last_sync_error = NULL
       WHERE document_id = ?`,
      [stage, changedAt, documentId],
    );
  }

  static async getExecutionDocuments(connection, documentId, lock = false) {
    const [rows] = await connection.query(
      `SELECT id, portal_document_id, source_system, document_1c_guid,
              document_number, document_date, confirmed, shipped_from_warehouse
       FROM tro_1c_execution_documents
       WHERE portal_document_id = ?
       ORDER BY document_date, id${lock ? " FOR UPDATE" : ""}`,
      [documentId],
    );
    return rows;
  }

  static async findExecutionDocumentConflicts(connection, sourceSystem, guids, documentId) {
    if (!guids.length) return [];
    const [rows] = await connection.query(
      `SELECT document_1c_guid, portal_document_id
       FROM tro_1c_execution_documents
       WHERE source_system = ? AND document_1c_guid IN (?)
         AND portal_document_id <> ?
       FOR UPDATE`,
      [sourceSystem, guids, documentId],
    );
    return rows;
  }

  static async syncExecutionDocuments(connection, documentId, sourceSystem, documents, existing = []) {
    const guids = documents.map((item) => item.documentGuid);
    const existingByGuid = new Map(existing.map((item) => [
      String(item.document_1c_guid).toLowerCase(),
      item,
    ]));
    for (const item of documents) {
      const current = existingByGuid.get(item.documentGuid);
      if (!current) {
        await connection.query(
          `INSERT INTO tro_1c_execution_documents
             (portal_document_id, source_system, document_1c_guid, document_number,
              document_date, confirmed, shipped_from_warehouse)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [documentId, sourceSystem, item.documentGuid, item.documentNumber,
            item.documentDate, item.confirmed, item.shippedFromWarehouse],
        );
      } else if (current.document_number !== item.documentNumber
        || new Date(current.document_date).getTime() !== item.documentDate.getTime()
        || Boolean(current.confirmed) !== item.confirmed
        || Boolean(current.shipped_from_warehouse) !== item.shippedFromWarehouse) {
        await connection.query(
          `UPDATE tro_1c_execution_documents
           SET document_number = ?, document_date = ?, confirmed = ?,
               shipped_from_warehouse = ?
           WHERE id = ? AND portal_document_id = ?`,
          [item.documentNumber, item.documentDate, item.confirmed,
            item.shippedFromWarehouse, current.id, documentId],
        );
      }
    }
    if (guids.length) {
      await connection.query(
        `DELETE FROM tro_1c_execution_documents
         WHERE portal_document_id = ? AND document_1c_guid NOT IN (?)`,
        [documentId, guids],
      );
    } else {
      await connection.query(
        "DELETE FROM tro_1c_execution_documents WHERE portal_document_id = ?",
        [documentId],
      );
    }
  }

  static async saveStageObservation(connection, documentId, stage, changedAt, stageChanged) {
    if (stageChanged) {
      await connection.query(
        `UPDATE tro_document_details
         SET one_c_stage = ?, one_c_stage_updated_at = ?, one_c_observed_at = ?,
             last_synced_at = NOW(), last_sync_error = NULL
         WHERE document_id = ?`,
        [stage, changedAt, changedAt, documentId],
      );
      return;
    }
    await connection.query(
      `UPDATE tro_document_details
       SET one_c_observed_at = ?, last_synced_at = NOW(), last_sync_error = NULL
       WHERE document_id = ?`,
      [changedAt, documentId],
    );
  }

  static async acknowledgeStatusSyncRequest(connection, documentId) {
    await connection.query(
      "UPDATE tro_document_details SET status_sync_requested_at = NULL WHERE document_id = ?",
      [documentId],
    );
  }

  static async reject(connection, { documentId, responsibleGuid, responsibleName }) {
    await connection.query(
      `UPDATE tro_document_details
       SET rejected_by_1c_guid = ?, rejected_by_1c_name = ?
       WHERE document_id = ?`,
      [responsibleGuid, responsibleName, documentId],
    );
    await connection.query(
      "UPDATE documents SET status = 'REJECTED' WHERE id = ?",
      [documentId],
    );
  }

  static async cancelPlanned(connection, documentId, branchId) {
    const [result] = await connection.query(
      `UPDATE documents SET status = 'CANCELLED'
       WHERE id = ? AND branch_id = ? AND document_type = 'TRO' AND status = 'PLANNED'`,
      [documentId, branchId],
    );
    if (result.affectedRows !== 1) throw new Error("Не вдалося скасувати заплановану заявку ТРО");
  }

  static async addHistory(connection, { documentId, userId, action, oldStatus, newStatus, comment }) {
    await connection.query(
      `INSERT INTO document_history
         (document_id, user_id, action, old_status, new_status, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [documentId, userId, action, oldStatus, newStatus, comment],
    );
  }

  static async getLastHistoryComment(connection, documentId, action) {
    const [[row]] = await connection.query(
      `SELECT comment FROM document_history
       WHERE document_id = ? AND action = ? ORDER BY id DESC LIMIT 1`,
      [documentId, action],
    );
    return row?.comment ?? null;
  }
}
