import fs from "fs/promises";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";
import { getImportSourcePath } from "./appConfig.service.js";
import { buildSalesAgentImportPlan } from "./salesAgentImportPlan.js";

const logger = createTaskLogger("loadSalesAgents");

async function loadPlanningState(connection, branchId) {
  const [users] = await connection.query(
    `SELECT id, NAME, user_name, current_agent_guid, is_active
     FROM users
     WHERE branch_id = ? AND is_active = 1`,
    [branchId],
  );
  const [existingPositions] = await connection.query(
    `SELECT id, login, user_id, current_agent_guid
     FROM sales_agents
     WHERE branch_id = ?`,
    [branchId],
  );
  return { users, existingPositions };
}

async function persistPlan(connection, branchId, plan, seenAt) {
  const activeLogins = [];

  for (const position of plan.positions) {
    activeLogins.push(position.login);
    await connection.query(
      `INSERT INTO sales_agents (
         user_id, login, route_guid, route_name, full_name,
         current_agent_guid, assortment_guid, assortment_name,
         supervisor_name, supervisor_guid, city, regional_division_guid,
         branch_id, last_seen_at, is_active_1c
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         route_guid = VALUES(route_guid),
         route_name = VALUES(route_name),
         full_name = VALUES(full_name),
         current_agent_guid = VALUES(current_agent_guid),
         assortment_guid = VALUES(assortment_guid),
         assortment_name = VALUES(assortment_name),
         supervisor_name = VALUES(supervisor_name),
         supervisor_guid = VALUES(supervisor_guid),
         city = VALUES(city),
         regional_division_guid = VALUES(regional_division_guid),
         last_seen_at = VALUES(last_seen_at),
         is_active_1c = 1`,
      [
        position.userId,
        position.login,
        position.routeGuid,
        position.routeName || null,
        position.fullName,
        position.currentAgentGuid,
        position.assortmentGuid,
        position.assortmentName || null,
        position.supervisorName || null,
        position.supervisorGuid,
        position.city || null,
        position.regionalDivisionGuid,
        branchId,
        seenAt,
      ],
    );
  }

  for (const anchor of plan.anchorUpdates) {
    await connection.query(
      `UPDATE users
       SET user_name = ?, current_agent_guid = ?
       WHERE id = ? AND branch_id = ? AND is_active = 1`,
      [anchor.userName || null, anchor.currentAgentGuid, anchor.userId, branchId],
    );
  }

  if (activeLogins.length) {
    await connection.query(
      `UPDATE sales_agents
       SET is_active_1c = 0
       WHERE branch_id = ? AND login NOT IN (?)`,
      [branchId, activeLogins],
    );
  } else {
    await connection.query(
      "UPDATE sales_agents SET is_active_1c = 0 WHERE branch_id = ?",
      [branchId],
    );
  }
}

export async function executeSalesAgentPlan(connection, branchId, plan, seenAt) {
  await connection.beginTransaction();
  try {
    await persistPlan(connection, branchId, plan, seenAt);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function loadSalesAgents() {
  const source = await getImportSourcePath("loadSalesAgents", "SalesAgent.json");
  const salesAgentFile = source?.filePath;
  const runLog = logger.start("loader started", { file: salesAgentFile });
  let connection;

  try {
    if (!salesAgentFile || !source?.isActive) {
      return {
        status: "skipped",
        code: "source_inactive",
        message: "Sales agents import source is inactive or not configured",
        details: { sourceKey: "loadSalesAgents" },
      };
    }

    try {
      await fs.access(salesAgentFile);
    } catch {
      return {
        status: "skipped",
        code: "source_missing",
        message: "Sales agents source file not found",
        details: { file: salesAgentFile },
      };
    }

    let raw = await fs.readFile(salesAgentFile, "utf8");
    raw = raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "").replace(/,\s*(?=[}\]])/g, "");
    const sourceRows = JSON.parse(raw);
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
      return {
        status: "skipped",
        code: "empty_source",
        message: "Sales agents source file is empty or invalid",
        details: { file: salesAgentFile },
      };
    }

    const branchId = Number(source.branch.id);
    connection = await pool.getConnection();
    const state = await loadPlanningState(connection, branchId);

    // The complete plan and every conflict are calculated before the transaction.
    const plan = buildSalesAgentImportPlan({ sourceRows, ...state });
    const seenAt = new Date();

    await executeSalesAgentPlan(connection, branchId, plan, seenAt);

    const hasWarnings = plan.stats.unmatched > 0;
    if (source.deleteAfterSuccess && !hasWarnings) {
      await fs.unlink(salesAgentFile);
      runLog.info("source file removed", { file: salesAgentFile });
    } else {
      runLog.info("source file kept", {
        file: salesAgentFile,
        deleteAfterSuccess: source.deleteAfterSuccess,
        hasWarnings,
      });
    }

    const result = {
      status: hasWarnings ? "completed_with_warnings" : "completed",
      code: hasWarnings ? "partial_import" : "import_completed",
      message: hasWarnings
        ? "Sales agent positions imported with warnings"
        : "Sales agent positions imported successfully",
      details: {
        ...plan.stats,
        conflicts: plan.conflicts,
        keptSourceFile: !source.deleteAfterSuccess || hasWarnings,
      },
    };
    runLog.end("loader completed", result.details);
    return result;
  } catch (error) {
    runLog.fail(error, "loader failed", {
      file: salesAgentFile,
      code: error.code || null,
    });
    return {
      status: "failed",
      code: error.code || "import_failed",
      message: error.message || "Sales agents import failed",
      details: { file: salesAgentFile },
    };
  } finally {
    connection?.release();
  }
}
