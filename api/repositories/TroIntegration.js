import pool from "../db.cjs";

export default class TroIntegrationRepository {
  static async getAccessibleBranchIds(userId, primaryBranchId) {
    const [rows] = await pool.query(
      "SELECT branch_id FROM user_branch_access WHERE user_id = ?",
      [userId],
    );
    return [...new Set([Number(primaryBranchId), ...rows.map((row) => Number(row.branch_id))])]
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  static buildReadyWhere({ branchIds, movementType, after, ceiling }) {
    const params = [...branchIds];
    const where = [
      "d.document_type = 'TRO'",
      "d.status = 'NOT_COMPLETED'",
      `d.branch_id IN (${branchIds.map(() => "?").join(", ")})`,
    ];
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

  static async getReadyCeiling({ branchIds, movementType }) {
    const { where, params } = this.buildReadyWhere({ branchIds, movementType });
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

  static async listReady({ branchIds, movementType, after, ceiling, limit }) {
    const { where, params } = this.buildReadyWhere({
      branchIds,
      movementType,
      after,
      ceiling,
    });
    params.push(limit);
    const [rows] = await pool.query(
      `SELECT d.id, d.document_number, d.created_at, d.updated_at, d.status, d.comment,
              d.branch_id, b.name AS branch_name, td.movement_type,
              tp.id_1c AS trade_point_guid, tp.name AS trade_point_name,
              tp.address AS trade_point_address,
              c.id_1c AS contractor_guid, c.name AS contractor_name,
              ta.current_agent_guid AS request_agent_guid, ta.user_name AS request_agent_name
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
       JOIN branches b ON b.id = d.branch_id
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

  static buildPendingWhere({ branchIds, after, ceiling }) {
    const where = [
      "d.document_type = 'TRO'",
      `d.branch_id IN (${branchIds.map(() => "?").join(", ")})`,
      "d.status <> 'REJECTED'",
      "td.document_1c_guid IS NOT NULL",
      "(td.one_c_stage IS NULL OR td.one_c_stage IN ('NEW', 'IN_PROGRESS'))",
    ];
    const params = [...branchIds];

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

  static async getPendingCeiling({ branchIds }) {
    const { where, params } = this.buildPendingWhere({ branchIds });
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

  static async listPending({ branchIds, after, ceiling, limit }) {
    const { where, params } = this.buildPendingWhere({ branchIds, after, ceiling });
    params.push(limit);
    const [rows] = await pool.query(
      `SELECT d.id, d.document_number, td.movement_type, td.document_1c_guid,
              td.source_system, td.one_c_stage, td.one_c_stage_updated_at,
              d.created_at AS cursor_created_at
       FROM documents d
       JOIN tro_document_details td ON td.document_id = d.id
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
              d.branch_id, td.ta_user_id, td.movement_type, td.up_document_number,
              td.executor_name, td.document_1c_guid, td.document_1c_date,
              td.source_system, td.executor_sales_agent_id, td.executor_agent_guid,
              td.warehouse_guid, td.one_c_stage, td.one_c_stage_updated_at,
              td.last_sync_error
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

  static async findSalesAgents(connection, branchId, guid) {
    const [rows] = await connection.query(
      `SELECT sa.id, sa.user_id, sa.full_name, u.user_name
       FROM sales_agents sa
       JOIN users u ON u.id = sa.user_id
       WHERE sa.branch_id = ? AND u.branch_id = ? AND u.is_active = 1
         AND LOWER(sa.current_agent_guid) = ?`,
      [branchId, branchId, guid],
    );
    return rows;
  }

  static async saveCreated(connection, values) {
    await connection.query(
      `UPDATE tro_document_details
       SET document_1c_guid = ?, document_1c_date = ?, source_system = ?,
           up_document_number = ?, executor_name = ?, executor_sales_agent_id = ?,
           executor_agent_guid = ?, warehouse_guid = ?, one_c_stage = 'NEW',
           one_c_stage_updated_at = NOW(), last_synced_at = NOW(), last_sync_error = ?
       WHERE document_id = ?`,
      [
        values.documentGuid, values.documentDate, values.sourceSystem,
        values.documentNumber, values.agentName, values.salesAgentId,
        values.agentGuid, values.warehouseGuid, values.warning, values.documentId,
      ],
    );
    await connection.query(
      "UPDATE documents SET status = 'PLANNED' WHERE id = ? AND status = 'NOT_COMPLETED'",
      [values.documentId],
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

  static async reject(connection, documentId) {
    await connection.query("UPDATE documents SET status = 'REJECTED' WHERE id = ?", [documentId]);
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
