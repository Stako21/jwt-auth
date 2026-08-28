import crypto from "crypto";
import fs from "fs/promises";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";
import { getImportSourcePath } from "./appConfig.service.js";

const logger = createTaskLogger("loadTroProducts");

function sourceKey(row) {
  return crypto
    .createHash("sha256")
    .update(
      [row.product_id, row.product_name, row.group_id, row.group_name]
        .map((value) => String(value || "").trim())
        .join("\u001f"),
    )
    .digest("hex");
}

export async function loadTroProducts() {
  const source = await getImportSourcePath("loadTroProducts", "Product_TRO.json");
  const file = source?.filePath;
  const runLog = logger.start("loader started", { file });

  try {
    if (!file || !source?.isActive) {
      return { status: "skipped", code: "source_inactive", message: "TRO source is inactive", details: {} };
    }

    try {
      await fs.access(file);
    } catch {
      return { status: "skipped", code: "source_missing", message: "TRO source file not found", details: { file } };
    }

    const raw = (await fs.readFile(file, "utf8"))
      .replace(/^\uFEFF/, "")
      .replace(/\u0000/g, "")
      .replace(/,\s*(?=[}\]])/g, "");
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.length) {
      return { status: "skipped", code: "empty_source", message: "TRO source is empty", details: { file } };
    }

    const usedKeys = new Set();
    let imported = 0;
    let skipped = 0;

    const [branches] = await pool.query(
      "SELECT id FROM branches WHERE is_active = 1 ORDER BY id",
    );
    if (!branches.length) {
      return { status: "skipped", code: "no_active_branches", message: "No active branches", details: {} };
    }

    for (const row of rows) {
      const name = String(row?.product_name || "").trim();
      if (!name) {
        skipped += 1;
        continue;
      }
      const key = sourceKey(row);
      usedKeys.add(key);
    }

    if (!usedKeys.size) {
      return {
        status: "skipped",
        code: "no_valid_products",
        message: "TRO source has no valid products",
        details: { recordsCount: rows.length, skipped },
      };
    }

    for (const branch of branches) {
      const branchId = Number(branch.id);
      for (const row of rows) {
        const name = String(row?.product_name || "").trim();
        if (!name) continue;
        const key = sourceKey(row);
        await pool.query(
          `INSERT INTO tro_products
            (branch_id, source_key, id_1c, name, group_id_1c, group_name, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             id_1c = VALUES(id_1c), name = VALUES(name),
             group_id_1c = VALUES(group_id_1c), group_name = VALUES(group_name), is_active = 1`,
          [branchId, key, row.product_id || null, name, row.group_id || null, row.group_name || null],
        );
        imported += 1;
      }
      await pool.query(
        `UPDATE tro_products SET is_active = 0
         WHERE branch_id = ? AND source_key NOT IN (?)`,
        [branchId, Array.from(usedKeys)],
      );
    }

    const hasWarnings = skipped > 0;
    const result = {
      status: hasWarnings ? "completed_with_warnings" : "completed",
      code: hasWarnings ? "partial_import" : "import_completed",
      message: hasWarnings ? "TRO products imported with warnings" : "TRO products imported",
      details: { recordsCount: rows.length, branchCount: branches.length, imported, skipped },
    };
    runLog.end("loader completed", result.details);
    return result;
  } catch (error) {
    runLog.fail(error, "loader failed", { file });
    return { status: "failed", code: "import_failed", message: error.message, details: { file } };
  }
}
