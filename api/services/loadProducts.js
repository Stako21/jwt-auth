import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { createTaskLogger } from "./taskLogger.js";
import { getImportSourcePath } from "./appConfig.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createTaskLogger("loadProducts");

export async function loadProducts() {
  const source = await getImportSourcePath("loadProducts", "Product.json");
  const productFile = source?.filePath;
  const runLog = logger.start("loader started", { file: productFile });

  try {
    if (!productFile || !source?.isActive) {
      runLog.warn("import source is inactive or not configured, skipping", {
        sourceKey: "loadProducts",
      });
      return {
        status: "skipped",
        code: "source_inactive",
        message: "Products import source is inactive or not configured",
        details: {
          sourceKey: "loadProducts",
        },
      };
    }

    const branch = source?.branch;
    const branchId = Number(branch.id);

    try {
      await fs.access(productFile);
    } catch {
      runLog.warn("source file not found, skipping", { file: productFile });
      return {
        status: "skipped",
        code: "source_missing",
        message: "Products source file not found",
        details: {
          file: productFile,
        },
      };
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
      return {
        status: "failed",
        code: "json_parse_failed",
        message: "Products source JSON parse failed",
        details: {
          file: productFile,
        },
      };
    }

    runLog.info("json parsed", {
      isArray: Array.isArray(items),
      recordsCount: Array.isArray(items) ? items.length : null,
    });

    if (!Array.isArray(items) || items.length === 0) {
      runLog.warn("source file is empty or invalid array, skipping");
      return {
        status: "skipped",
        code: "empty_source",
        message: "Products source file is empty or invalid",
        details: {
          file: productFile,
        },
      };
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

    if (groupsMap.size === 0) {
      runLog.warn("no valid product groups found in source file, skipping import", {
        recordsCount: items.length,
      });
      return {
        status: "skipped",
        code: "no_valid_groups",
        message: "Products import has no valid groups in the source file",
        details: {
          recordsCount: items.length,
        },
      };
    }

    let groupErrorCount = 0;
    for (const [group1cId, groupName] of groupsMap.entries()) {
      try {
        await pool.query(
          `
          INSERT INTO product_groups (id_1c, name, branch_id)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            branch_id = VALUES(branch_id),
            is_active = 1
          `,
          [group1cId, groupName, branchId]
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
        AND branch_id = ?
      `,
      [Array.from(usedGroupIds), branchId]
    );

    const groupIdMap = new Map();
    for (const group of groupRows) {
      groupIdMap.set(group.id_1c, group.id);
    }

    if (groupIdMap.size === 0) {
      runLog.warn("no product groups were resolved for current branch, skipping import", {
        expectedGroups: usedGroupIds.size,
        branchId,
      });
      return {
        status: "skipped",
        code: "groups_not_resolved",
        message: "Products import could not resolve groups for the current branch",
        details: {
          expectedGroups: usedGroupIds.size,
          branchId,
        },
      };
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
          INSERT INTO products (id_1c, name, group_id, branch_id)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            group_id = VALUES(group_id),
            branch_id = VALUES(branch_id),
            is_active = 1
          `,
          [row.product_id, row.product_name, groupId, branchId]
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

    if (usedProductIds.size === 0) {
      runLog.warn("no valid products were imported, deactivation sync skipped", {
        recordsCount: items.length,
        skippedInvalidRows,
        missingGroups,
        rowErrorCount,
      });
      return {
        status: "skipped",
        code: "no_products_imported",
        message: "Products import did not produce any valid products",
        details: {
          recordsCount: items.length,
          skippedInvalidRows,
          missingGroups,
          rowErrorCount,
        },
      };
    }

    const [productsDisabledRes] = await pool.query(
      `
      UPDATE products
      SET is_active = 0
      WHERE id_1c NOT IN (?)
        AND branch_id = ?
      `,
      [Array.from(usedProductIds), branchId]
    );
    runLog.info("products deactivated outside source file", {
      affectedRows: productsDisabledRes.affectedRows,
    });

    const [groupsDisabledRes] = await pool.query(
      `
      UPDATE product_groups
      SET is_active = 0
      WHERE id_1c NOT IN (?)
        AND branch_id = ?
      `,
      [Array.from(usedGroupIds), branchId]
    );
    runLog.info("product groups deactivated outside source file", {
      affectedRows: groupsDisabledRes.affectedRows,
    });

    const hasUnresolvedRows =
      skippedInvalidRows > 0 ||
      missingGroups > 0 ||
      groupErrorCount > 0 ||
      rowErrorCount > 0;

    if (!source.deleteAfterSuccess) {
      runLog.info("source file kept after successful import", { file: productFile });
    } else if (hasUnresolvedRows) {
      runLog.warn("source file kept after partial import", {
        file: productFile,
        skippedInvalidRows,
        missingGroups,
        groupErrorCount,
        rowErrorCount,
      });
    } else {
      await fs.unlink(productFile);
      runLog.info("source file removed", { file: productFile });
    }

    const result = {
      status: hasUnresolvedRows ? "completed_with_warnings" : "completed",
      code: hasUnresolvedRows ? "partial_import" : "import_completed",
      message: hasUnresolvedRows
        ? "Products imported with warnings"
        : "Products imported successfully",
      details: {
        recordsCount: items.length,
        groupsCount: usedGroupIds.size,
        importedProducts,
        skippedInvalidRows,
        missingGroups,
        groupErrorCount,
        rowErrorCount,
        keptSourceFile: !source.deleteAfterSuccess || hasUnresolvedRows,
      },
    };

    runLog.end("loader completed", {
      recordsCount: items.length,
      groupsCount: usedGroupIds.size,
      importedProducts,
      skippedInvalidRows,
      missingGroups,
      groupErrorCount,
      rowErrorCount,
      keptSourceFile: !source.deleteAfterSuccess || hasUnresolvedRows,
    });
    return result;
  } catch (error) {
    runLog.fail(error, "loader failed", { file: productFile });
    return {
      status: "failed",
      code: "import_failed",
      message: "Products import failed",
      details: {
        file: productFile,
        errorMessage: error.message,
      },
    };
  }
}
