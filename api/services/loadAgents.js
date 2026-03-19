import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const salesAgentFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "SalesAgent.json"
);

const logger = createTaskLogger("loadSalesAgents");

export async function loadSalesAgents() {
  const runLog = logger.start("loader started", { file: salesAgentFile });

  try {
    try {
      await fs.access(salesAgentFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: salesAgentFile });
      return;
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
    } catch (e) {
      runLog.fail(e, "json parse failed", { rawPreview: raw.slice(0, 200) });
      await fs.writeFile(salesAgentFile + ".sanitized.json", raw, "utf8");
      return;
    }

    runLog.info("json parsed", {
      isArray: Array.isArray(agents),
      recordsCount: Array.isArray(agents) ? agents.length : null,
    });

    if (!Array.isArray(agents) || agents.length === 0) {
      runLog.warn("source file is empty or invalid array, skipping");
      return;
    }

    let importedCount = 0;
    let skippedWithoutLogin = 0;
    let skippedUserNotFound = 0;
    let rowErrorCount = 0;

    for (const agent of agents) {
      try {
        if (!agent || !agent.login) {
          skippedWithoutLogin += 1;
          runLog.warn("agent row skipped: missing login", { agent });
          continue;
        }

        const [userRows] = await pool.query(
          "SELECT id FROM users WHERE NAME = ?",
          [agent.login]
        );

        if (userRows.length === 0) {
          skippedUserNotFound += 1;
          runLog.warn("user not found for sales agent", { login: agent.login });
          continue;
        }

        const userId = userRows[0].id;

        await pool.query(
          `INSERT INTO sales_agents (user_id, login, full_name, supervisor_name, city)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             full_name = VALUES(full_name),
             supervisor_name = VALUES(supervisor_name),
             city = VALUES(city)`,
          [
            userId,
            agent.login,
            agent.currentAgent,
            agent.supervisor,
            agent.regionalDivision,
          ]
        );

        importedCount += 1;
      } catch (rowErr) {
        rowErrorCount += 1;
        runLog.error("agent row processing failed", {
          login: agent?.login,
          errorMessage: rowErr.message,
          errorStack: rowErr.stack,
        });
      }
    }

    runLog.info("rows processed", {
      processedCount: agents.length,
      importedCount,
      skippedWithoutLogin,
      skippedUserNotFound,
      rowErrorCount,
    });

    try {
      await fs.unlink(salesAgentFile);
      runLog.info("source file removed", { file: salesAgentFile });
    } catch (unlinkErr) {
      runLog.error("failed to remove source file", {
        file: salesAgentFile,
        errorMessage: unlinkErr.message,
        errorStack: unlinkErr.stack,
      });
    }

    const syncedUsers = await syncUserNamesFromSalesAgents();
    runLog.end("loader completed", {
      importedCount,
      syncedUsers,
    });
  } catch (err) {
    runLog.fail(err, "loader failed", { file: salesAgentFile });
  }
}

async function syncUserNamesFromSalesAgents() {
  const [result] = await pool.query(`
    UPDATE users u
    JOIN sales_agents sa ON sa.user_id = u.id
    SET u.user_name = sa.full_name
    WHERE
      sa.full_name IS NOT NULL
      AND sa.full_name <> ''
  `);

  logger.info("users.user_name synchronized from sales_agents", {
    affectedRows: result.affectedRows,
  });

  return result.affectedRows;
}
