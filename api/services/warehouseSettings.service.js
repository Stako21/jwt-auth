import pool from "../db.cjs";
import { BadRequest, NotFound } from "../utils/Errors.js";

function normalizeGuid(value) {
  const guid = String(value || "").trim().toLowerCase();
  return guid || null;
}

function normalizeRate(value, label) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new BadRequest(`${label} має бути невід'ємним числом`);
  }
  return rate;
}

function normalizeDate(value) {
  const date = String(value || "").trim();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new BadRequest("effectiveFrom має бути датою у форматі YYYY-MM-DD");
  }
  return date;
}

export async function syncWarehousesFromRows(connection, branchId, rows) {
  const warehouses = new Map();

  for (const row of rows) {
    const warehouseGuid = normalizeGuid(row.warehouseGuid);
    const warehouseName = String(row.warehouseName || "").trim();
    if (!warehouseGuid || !warehouseName) continue;
    warehouses.set(warehouseGuid, warehouseName);
  }

  for (const [warehouseGuid, warehouseName] of warehouses) {
    await connection.query(
      `
      INSERT INTO warehouses (branch_id, warehouse_guid, warehouse_name)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        warehouse_name = VALUES(warehouse_name),
        is_active = 1
      `,
      [branchId, warehouseGuid, warehouseName],
    );
  }
}

export async function getWarehouses(branchId) {
  const [warehouses] = await pool.query(
    `
    SELECT
      w.id,
      w.warehouse_guid AS warehouseGuid,
      w.warehouse_name AS warehouseName,
      w.is_active AS isActive,
      current_rate.effective_from AS effectiveFrom,
      current_rate.row_rate AS rowRate,
      current_rate.kilogram_rate AS kilogramRate
    FROM warehouses w
    LEFT JOIN warehouse_rate_history current_rate
      ON current_rate.id = (
        SELECT r.id
        FROM warehouse_rate_history r
        WHERE r.warehouse_id = w.id
          AND r.effective_from <= CURDATE()
        ORDER BY r.effective_from DESC, r.id DESC
        LIMIT 1
      )
    WHERE w.branch_id = ?
    ORDER BY w.warehouse_name, w.id
    `,
    [branchId],
  );

  const [rates] = await pool.query(
    `
    SELECT
      r.id,
      r.warehouse_id AS warehouseId,
      DATE_FORMAT(r.effective_from, '%Y-%m-%d') AS effectiveFrom,
      r.row_rate AS rowRate,
      r.kilogram_rate AS kilogramRate,
      r.created_by AS createdBy,
      COALESCE(u.user_name, u.name) AS createdByName,
      DATE_FORMAT(r.updated_at, '%Y-%m-%dT%H:%i:%s') AS updatedAt
    FROM warehouse_rate_history r
    LEFT JOIN users u ON u.id = r.created_by
    WHERE r.branch_id = ?
    ORDER BY r.warehouse_id, r.effective_from DESC, r.id DESC
    `,
    [branchId],
  );

  const ratesByWarehouse = new Map();
  for (const rate of rates) {
    const key = Number(rate.warehouseId);
    if (!ratesByWarehouse.has(key)) ratesByWarehouse.set(key, []);
    ratesByWarehouse.get(key).push(rate);
  }

  return warehouses.map((warehouse) => ({
    ...warehouse,
    isActive: Boolean(warehouse.isActive),
    rates: ratesByWarehouse.get(Number(warehouse.id)) || [],
  }));
}

async function getWarehouse(connection, branchId, warehouseId) {
  const [[warehouse]] = await connection.query(
    `
    SELECT id, warehouse_guid AS warehouseGuid, warehouse_name AS warehouseName
    FROM warehouses
    WHERE id = ? AND branch_id = ?
    LIMIT 1
    `,
    [warehouseId, branchId],
  );
  if (!warehouse) throw new NotFound("Склад не знайдено у поточній філії");
  return warehouse;
}

async function buildRateImpact(connection, branchId, warehouse, effectiveFrom) {
  const [[nextRate]] = await connection.query(
    `
    SELECT DATE_FORMAT(MIN(effective_from), '%Y-%m-%d') AS nextEffectiveFrom
    FROM warehouse_rate_history
    WHERE warehouse_id = ?
      AND effective_from > ?
    `,
    [warehouse.id, effectiveFrom],
  );

  const nextEffectiveFrom = nextRate?.nextEffectiveFrom || null;
  const [[impact]] = await connection.query(
    `
    SELECT
      COUNT(*) AS affectedRowsCount,
      COUNT(DISTINCT picker_guid) AS affectedPickersCount,
      DATE_FORMAT(MIN(report_date), '%Y-%m-%d') AS affectedDateFrom,
      DATE_FORMAT(MAX(report_date), '%Y-%m-%d') AS affectedDateTo
    FROM bill_of_lading_report_rows
    WHERE branch_id = ?
      AND warehouse_guid = ?
      AND report_date >= ?
      AND (? IS NULL OR report_date < ?)
    `,
    [
      branchId,
      warehouse.warehouseGuid,
      effectiveFrom,
      nextEffectiveFrom,
      nextEffectiveFrom,
    ],
  );

  const affectedRowsCount = Number(impact?.affectedRowsCount || 0);
  return {
    nextEffectiveFrom,
    affectedRowsCount,
    affectedPickersCount: Number(impact?.affectedPickersCount || 0),
    affectedDateFrom: impact?.affectedDateFrom || null,
    affectedDateTo: impact?.affectedDateTo || null,
    confirmationRequired: affectedRowsCount > 0,
  };
}

export async function previewWarehouseRateChange({
  branchId,
  warehouseId,
  effectiveFrom,
  rowRate,
  kilogramRate,
}) {
  const normalizedDate = normalizeDate(effectiveFrom);
  const normalizedRowRate = normalizeRate(rowRate, "Вартість рядка");
  const normalizedKilogramRate = normalizeRate(
    kilogramRate,
    "Вартість кілограма",
  );
  const connection = await pool.getConnection();

  try {
    const warehouse = await getWarehouse(connection, branchId, warehouseId);
    const [[existing]] = await connection.query(
      `
      SELECT row_rate AS rowRate, kilogram_rate AS kilogramRate
      FROM warehouse_rate_history
      WHERE warehouse_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
      `,
      [warehouse.id, normalizedDate],
    );
    const impact = await buildRateImpact(
      connection,
      branchId,
      warehouse,
      normalizedDate,
    );

    return {
      warehouse,
      effectiveFrom: normalizedDate,
      rowRate: normalizedRowRate,
      kilogramRate: normalizedKilogramRate,
      oldRowRate: existing?.rowRate ?? null,
      oldKilogramRate: existing?.kilogramRate ?? null,
      ...impact,
    };
  } finally {
    connection.release();
  }
}

export async function saveWarehouseRate({
  branchId,
  warehouseId,
  userId,
  effectiveFrom,
  rowRate,
  kilogramRate,
  confirmHistoricalChange = false,
}) {
  const normalizedDate = normalizeDate(effectiveFrom);
  const normalizedRowRate = normalizeRate(rowRate, "Вартість рядка");
  const normalizedKilogramRate = normalizeRate(
    kilogramRate,
    "Вартість кілограма",
  );
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const warehouse = await getWarehouse(connection, branchId, warehouseId);
    const [[existing]] = await connection.query(
      `
      SELECT id, row_rate AS rowRate, kilogram_rate AS kilogramRate
      FROM warehouse_rate_history
      WHERE warehouse_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
      FOR UPDATE
      `,
      [warehouse.id, normalizedDate],
    );
    const impact = await buildRateImpact(
      connection,
      branchId,
      warehouse,
      normalizedDate,
    );

    if (impact.confirmationRequired && !confirmHistoricalChange) {
      await connection.rollback();
      return { saved: false, confirmationRequired: true, impact };
    }

    await connection.query(
      `
      INSERT INTO warehouse_rate_history (
        branch_id, warehouse_id, effective_from, row_rate, kilogram_rate, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        row_rate = VALUES(row_rate),
        kilogram_rate = VALUES(kilogram_rate),
        created_by = VALUES(created_by)
      `,
      [
        branchId,
        warehouse.id,
        normalizedDate,
        normalizedRowRate,
        normalizedKilogramRate,
        userId,
      ],
    );

    await connection.query(
      `
      INSERT INTO warehouse_rate_audit (
        branch_id,
        warehouse_id,
        effective_from,
        old_row_rate,
        new_row_rate,
        old_kilogram_rate,
        new_kilogram_rate,
        affected_rows_count,
        affected_date_from,
        affected_date_to,
        changed_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        branchId,
        warehouse.id,
        normalizedDate,
        existing?.rowRate ?? null,
        normalizedRowRate,
        existing?.kilogramRate ?? null,
        normalizedKilogramRate,
        impact.affectedRowsCount,
        impact.affectedDateFrom,
        impact.affectedDateTo,
        userId,
      ],
    );

    await connection.commit();
    return { saved: true, confirmationRequired: false, impact };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
