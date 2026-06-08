import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";
import { getImportSourcePath } from "./appConfig.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createTaskLogger("loadSalesAgents");

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanGuid(value) {
  const text = cleanText(value).toLowerCase();
  return text || null;
}

export async function loadSalesAgents() {
  const source = await getImportSourcePath("loadSalesAgents", "SalesAgent.json");
  const salesAgentFile = source?.filePath;
  const runLog = logger.start("loader started", { file: salesAgentFile });
  let connection;

  try {
    if (!salesAgentFile || !source?.isActive) {
      runLog.warn("import source is inactive or not configured, skipping", {
        sourceKey: "loadSalesAgents",
      });
      return {
        status: "skipped",
        code: "source_inactive",
        message: "Sales agents import source is inactive or not configured",
        details: {
          sourceKey: "loadSalesAgents",
        },
      };
    }

    const branch = source?.branch;
    const branchId = Number(branch.id);

    try {
      await fs.access(salesAgentFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: salesAgentFile });
      return {
        status: "skipped",
        code: "source_missing",
        message: "Sales agents source file not found",
        details: {
          file: salesAgentFile,
        },
      };
    }

    const fileStat = await fs.stat(salesAgentFile);
    runLog.info("source file found", {
      file: salesAgentFile,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });

    let raw = await fs.readFile(salesAgentFile, "utf-8");
    runLog.info("source file read", { rawLength: raw.length });
    raw = raw.replace(/^\uFEFF/, "");
    raw = raw.replace(/\u0000/g, "");
    raw = raw.replace(/,\s*(?=[}\]])/g, "");

    let agents;
    try {
      agents = JSON.parse(raw);
    } catch (error) {
      runLog.fail(error, "json parse failed", { rawPreview: raw.slice(0, 200) });
      await fs.writeFile(salesAgentFile + ".sanitized.json", raw, "utf8");
      return {
        status: "failed",
        code: "json_parse_failed",
        message: "Sales agents source JSON parse failed",
        details: {
          file: salesAgentFile,
          sanitizedFile: salesAgentFile + ".sanitized.json",
        },
      };
    }

    runLog.info("json parsed", {
      isArray: Array.isArray(agents),
      recordsCount: Array.isArray(agents) ? agents.length : null,
    });

    if (!Array.isArray(agents) || agents.length === 0) {
      runLog.warn("source file is empty or invalid array, skipping");
      return {
        status: "skipped",
        code: "empty_source",
        message: "Sales agents source file is empty or invalid",
        details: {
          file: salesAgentFile,
        },
      };
    }

    let skippedWithoutLogin = 0;
    let skippedUserNotFound = 0;
    const candidateAgents = [];

    for (const agent of agents) {
      if (!agent || !agent.login) {
        skippedWithoutLogin += 1;
        runLog.warn("agent row skipped: missing login", { agent });
        continue;
      }

      candidateAgents.push(agent);
    }

    if (candidateAgents.length === 0) {
      runLog.warn("no valid sales agents remained after precheck, skipping import", {
        recordsCount: agents.length,
        skippedWithoutLogin,
      });
      return {
        status: "skipped",
        code: "no_valid_rows",
        message: "Sales agents import has no valid rows after precheck",
        details: {
          recordsCount: agents.length,
          skippedWithoutLogin,
        },
      };
    }

    connection = await pool.getConnection();
    runLog.info("db connection acquired");

    const uniqueLogins = Array.from(
      new Set(candidateAgents.map((agent) => String(agent.login).trim()).filter(Boolean)),
    );

    const [userRows] = await connection.query(
      `
      SELECT id, NAME
      FROM users
      WHERE NAME IN (?)
        AND is_active = 1
        AND branch_id = ?
      `,
      [uniqueLogins, branchId],
    );

    const userIdByLogin = new Map(userRows.map((user) => [user.NAME, Number(user.id)]));
    const importableAgents = [];

    for (const agent of candidateAgents) {
      const login = cleanText(agent.login);
      const fullName = cleanText(agent.currentAgent);
      const userId = userIdByLogin.get(login);

      if (!userId) {
        skippedUserNotFound += 1;
        runLog.warn("user not found for sales agent", {
          login,
          currentAgent: fullName || null,
        });
        continue;
      }

      importableAgents.push({
        login,
        userId,
        fullName,
        routeGuid: cleanGuid(agent.routeGuid),
        currentAgentGuid: cleanGuid(agent.currentAgentGuid),
        supervisorName: cleanText(agent.supervisor),
        supervisorGuid: cleanGuid(agent.supervisorGuid),
        city: cleanText(agent.regionalDivision),
        regionalDivisionGuid: cleanGuid(agent.regionalDivisionGuid),
      });
    }

    if (importableAgents.length === 0) {
      runLog.warn("no sales agents could be matched to active users, skipping import", {
        recordsCount: agents.length,
        skippedWithoutLogin,
        skippedUserNotFound,
        branchId,
      });
      return {
        status: "skipped",
        code: "no_matching_users",
        message: "Sales agents import has no rows matched to active users",
        details: {
          recordsCount: agents.length,
          skippedWithoutLogin,
          skippedUserNotFound,
          branchId,
        },
      };
    }

    await connection.beginTransaction();
    runLog.info("transaction started", {
      candidateAgents: candidateAgents.length,
      importableAgents: importableAgents.length,
    });

    for (const agent of importableAgents) {
      try {
        await connection.query(
          `INSERT INTO sales_agents (
             user_id,
             login,
             route_guid,
             full_name,
             current_agent_guid,
             supervisor_name,
             supervisor_guid,
             city,
             regional_division_guid,
             branch_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             route_guid = VALUES(route_guid),
             full_name = VALUES(full_name),
             current_agent_guid = VALUES(current_agent_guid),
             supervisor_name = VALUES(supervisor_name),
             supervisor_guid = VALUES(supervisor_guid),
             city = VALUES(city),
             regional_division_guid = VALUES(regional_division_guid),
             branch_id = VALUES(branch_id)`,
          [
            agent.userId,
            agent.login,
            agent.routeGuid,
            agent.fullName,
            agent.currentAgentGuid,
            agent.supervisorName,
            agent.supervisorGuid,
            agent.city,
            agent.regionalDivisionGuid,
            branchId,
          ],
        );
      } catch (rowError) {
        runLog.error("agent row processing failed", {
          login: agent.login,
          errorMessage: rowError.message,
          errorStack: rowError.stack,
        });
        throw rowError;
      }
    }

    runLog.info("rows processed", {
      processedCount: agents.length,
      importedCount: importableAgents.length,
      skippedWithoutLogin,
      skippedUserNotFound,
    });

    const syncedUsers = await syncUserNamesFromSalesAgents(connection, branchId);
    await connection.commit();
    runLog.info("transaction committed", {
      importedCount: importableAgents.length,
      syncedUsers,
    });

    const hasUnresolvedRows = skippedWithoutLogin > 0 || skippedUserNotFound > 0;

    try {
      if (!source.deleteAfterSuccess) {
        runLog.info("source file kept after successful import", {
          file: salesAgentFile,
        });
      } else if (hasUnresolvedRows) {
        runLog.warn("source file kept after partial import", {
          file: salesAgentFile,
          skippedWithoutLogin,
          skippedUserNotFound,
        });
      } else {
        await fs.unlink(salesAgentFile);
        runLog.info("source file removed", { file: salesAgentFile });
      }
    } catch (unlinkError) {
      runLog.error("failed to remove source file", {
        file: salesAgentFile,
        errorMessage: unlinkError.message,
        errorStack: unlinkError.stack,
      });
    }

    const result = {
      status: hasUnresolvedRows ? "completed_with_warnings" : "completed",
      code: hasUnresolvedRows ? "partial_import" : "import_completed",
      message: hasUnresolvedRows
        ? "Sales agents imported with warnings"
        : "Sales agents imported successfully",
      details: {
        processedCount: agents.length,
        importedCount: importableAgents.length,
        skippedWithoutLogin,
        skippedUserNotFound,
        syncedUsers,
        keptSourceFile: !source.deleteAfterSuccess || hasUnresolvedRows,
      },
    };

    runLog.end("loader completed", {
      importedCount: importableAgents.length,
      syncedUsers,
      keptSourceFile: !source.deleteAfterSuccess || hasUnresolvedRows,
    });
    return result;
  } catch (error) {
    try {
      if (connection) {
        await connection.rollback();
        runLog.info("transaction rolled back");
      }
    } catch (rollbackError) {
      runLog.error("transaction rollback failed", {
        errorMessage: rollbackError.message,
        errorStack: rollbackError.stack,
      });
    }

    runLog.fail(error, "loader failed", { file: salesAgentFile });
    return {
      status: "failed",
      code: "import_failed",
      message: "Sales agents import failed",
      details: {
        file: salesAgentFile,
        errorMessage: error.message,
      },
    };
  } finally {
    if (connection) {
      connection.release();
      logger.info("db connection released");
    }
  }
}

async function syncUserNamesFromSalesAgents(connection, branchId) {
  const [result] = await connection.query(
    `
    UPDATE users u
    JOIN sales_agents sa ON sa.user_id = u.id
    SET
      u.user_name = sa.full_name,
      u.current_agent_guid = sa.current_agent_guid
    WHERE
      sa.branch_id = ?
      AND u.branch_id = ?
      AND
      sa.full_name IS NOT NULL
      AND sa.full_name <> ''
  `,
    [branchId, branchId],
  );

  logger.info("users.user_name synchronized from sales_agents", {
    affectedRows: result.affectedRows,
  });

  return result.affectedRows;
}
