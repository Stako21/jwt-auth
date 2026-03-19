import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "Product.json"
);

const logger = createTaskLogger("loadProducts");

export async function loadProducts() {
  const runLog = logger.start("loader started", { file: productFile });

  try {
    try {
      await fs.access(productFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: productFile });
      return;
    }

    const fileStat = await fs.stat(productFile);
    runLog.info("source file found", {
      file: productFile,
      sizeBytes: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
    });

    let raw = await fs.readFile(productFile, "utf-8");
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

    const usedProductIds = new Set();
    const usedGroupIds = new Set();
    const groupsMap = new Map();

    for (const row of items) {
      if (row.group_id && row.group_name) {
        groupsMap.set(row.group_id, row.group_name);
        usedGroupIds.add(row.group_id);
      }
    }

    runLog.info("product groups prepared", {
      groupsCount: groupsMap.size,
      recordsCount: items.length,
    });

    let groupErrorCount = 0;
    for (const [group1cId, groupName] of groupsMap.entries()) {
      try {
        await pool.query(
          `
          INSERT INTO product_groups (id_1c, name)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            is_active = 1
          `,
          [group1cId, groupName]
        );
      } catch (err) {
        groupErrorCount += 1;
        runLog.error("group import failed", {
          group1cId,
          errorMessage: err.message,
          errorStack: err.stack,
        });
      }
    }

    const [groupRows] = await pool.query(
      `
      SELECT id, id_1c
      FROM product_groups
      WHERE id_1c IN (?)
      `,
      [Array.from(usedGroupIds)]
    );

    const groupIdMap = new Map();
    for (const group of groupRows) {
      groupIdMap.set(group.id_1c, group.id);
    }

    let importedProducts = 0;
    let skippedInvalidRows = 0;
    let missingGroups = 0;
    let rowErrorCount = 0;

    for (const row of items) {
      try {
        if (!row.product_id || !row.product_name || !row.group_id) {
          skippedInvalidRows += 1;
          runLog.warn("product row skipped: invalid data", {
            productId: row?.product_id,
            groupId: row?.group_id,
          });
          continue;
        }

        const groupId = groupIdMap.get(row.group_id);
        if (!groupId) {
          missingGroups += 1;
          runLog.error("group not found for product", {
            productId: row.product_id,
            group1cId: row.group_id,
          });
          continue;
        }

        await pool.query(
          `
          INSERT INTO products (id_1c, name, group_id)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            group_id = VALUES(group_id),
            is_active = 1
          `,
          [row.product_id, row.product_name, groupId]
        );

        usedProductIds.add(row.product_id);
        importedProducts += 1;
      } catch (err) {
        rowErrorCount += 1;
        runLog.error("product row processing failed", {
          productId: row?.product_id,
          errorMessage: err.message,
          errorStack: err.stack,
        });
      }
    }

    if (usedProductIds.size > 0) {
      const [productsDisabledRes] = await pool.query(
        `
        UPDATE products
        SET is_active = 0
        WHERE id_1c NOT IN (?)
        `,
        [Array.from(usedProductIds)]
      );
      runLog.info("products deactivated outside source file", {
        affectedRows: productsDisabledRes.affectedRows,
      });
    }

    if (usedGroupIds.size > 0) {
      const [groupsDisabledRes] = await pool.query(
        `
        UPDATE product_groups
        SET is_active = 0
        WHERE id_1c NOT IN (?)
        `,
        [Array.from(usedGroupIds)]
      );
      runLog.info("product groups deactivated outside source file", {
        affectedRows: groupsDisabledRes.affectedRows,
      });
    }

    await fs.unlink(productFile);
    runLog.info("source file removed", { file: productFile });

    runLog.end("loader completed", {
      recordsCount: items.length,
      groupsCount: usedGroupIds.size,
      importedProducts,
      skippedInvalidRows,
      missingGroups,
      groupErrorCount,
      rowErrorCount,
    });
  } catch (error) {
    runLog.fail(error, "loader failed", { file: productFile });
  }
}
