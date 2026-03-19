import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tradePointFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "TradePoint.json"
);

const logger = createTaskLogger("loadTradePoints");

export async function loadTradePoints() {
  const runLog = logger.start("loader started", { file: tradePointFile });

  try {
    try {
      await fs.access(tradePointFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: tradePointFile });
      return;
    }

    const fileStat = await fs.stat(tradePointFile);
    runLog.info("source file found", {
      file: tradePointFile,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });

    let raw = await fs.readFile(tradePointFile, "utf-8");
    runLog.info("source file read", { rawLength: raw.length });
    raw = raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "").replace(/,\s*(?=[}\]])/g, "");

    let items;
    try {
      items = JSON.parse(raw);
    } catch (e) {
      runLog.fail(e, "json parse failed");
      return;
    }

    runLog.info("json parsed", {
      isArray: Array.isArray(items),
      recordsCount: Array.isArray(items) ? items.length : null,
    });

    if (!Array.isArray(items) || items.length === 0) {
      runLog.warn("source file is empty or invalid array, skipping");
      return;
    }

    const usedTradePoints = new Set();
    const usedContractors = new Set();
    let skippedInvalidRows = 0;
    let rowErrorCount = 0;

    for (const row of items) {
      try {
        if (!row.trade_point_id || !row.contractor_id) {
          skippedInvalidRows += 1;
          runLog.warn("trade point row skipped: invalid data", {
            tradePointId: row?.trade_point_id,
            contractorId: row?.contractor_id,
          });
          continue;
        }

        await pool.query(
          `
          INSERT INTO contractors (id_1c, name)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            is_active = 1
          `,
          [row.contractor_id, row.contractor_name]
        );

        const [[contractor]] = await pool.query(
          `SELECT id FROM contractors WHERE id_1c = ?`,
          [row.contractor_id]
        );

        await pool.query(
          `
          INSERT INTO trade_points (id_1c, name, address, contractor_id)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            address = VALUES(address),
            contractor_id = VALUES(contractor_id),
            is_active = 1
          `,
          [
            row.trade_point_id,
            row.trade_point_name,
            row.trade_point_address,
            contractor.id,
          ]
        );

        usedTradePoints.add(row.trade_point_id);
        usedContractors.add(row.contractor_id);
      } catch (err) {
        rowErrorCount += 1;
        runLog.error("trade point row processing failed", {
          tradePointId: row?.trade_point_id,
          contractorId: row?.contractor_id,
          errorMessage: err.message,
          errorStack: err.stack,
        });
      }
    }

    const [tradePointsDisabledRes] = await pool.query(
      `
      UPDATE trade_points
      SET is_active = 0
      WHERE id_1c NOT IN (?)
      `,
      [Array.from(usedTradePoints)]
    );

    const [contractorsDisabledRes] = await pool.query(
      `
      UPDATE contractors
      SET is_active = 0
      WHERE id_1c NOT IN (?)
      `,
      [Array.from(usedContractors)]
    );

    runLog.info("deactivation sync completed", {
      disabledTradePoints: tradePointsDisabledRes.affectedRows,
      disabledContractors: contractorsDisabledRes.affectedRows,
    });

    await fs.unlink(tradePointFile);
    runLog.info("source file removed", { file: tradePointFile });

    runLog.end("loader completed", {
      recordsCount: items.length,
      importedTradePoints: usedTradePoints.size,
      importedContractors: usedContractors.size,
      skippedInvalidRows,
      rowErrorCount,
    });
  } catch (error) {
    runLog.fail(error, "loader failed", { file: tradePointFile });
  }
}
