import pool from "../db.cjs";
import {
  defaultBootstrapBranchConfig,
  DEFAULT_BRANCH_ID,
} from "../config/bootstrapBranchConfig.js";

const APPLY_FLAG = "--apply";
const ALLOW_NON_LOCAL_FLAG = "--allow-non-local";

function isLocalDatabaseHost(host) {
  const normalized = String(host || "").trim().toLowerCase();
  return ["localhost", "127.0.0.1", "::1"].includes(normalized);
}

function normalizeComparableValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify([...new Set(value.map(Number))].sort((a, b) => a - b));
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
    return trimmed;
  }

  return value ?? null;
}

function normalizeAllowedRoles(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  let rawRoles = value;
  if (typeof value === "string") {
    try {
      rawRoles = JSON.parse(value);
    } catch {
      rawRoles = value.split(",");
    }
  }

  if (!Array.isArray(rawRoles)) return null;

  const roles = [...new Set(rawRoles.map(Number))]
    .filter((roleId) => Number.isInteger(roleId) && roleId > 0)
    .sort((a, b) => a - b);

  return roles;
}

function serializeAllowedRoles(value) {
  const roles = normalizeAllowedRoles(value);
  return roles === null ? null : JSON.stringify(roles);
}

async function loadCurrentState(connection, branchId) {
  const [[branch]] = await connection.query(
    `
    SELECT id, slug, name, short_name AS shortName, is_active AS isActive
    FROM branches
    WHERE id = ?
    LIMIT 1
    `,
    [branchId],
  );

  const [cities] = await connection.query(
    `
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      document_prefix AS documentPrefix,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM cities
    WHERE branch_id = ?
    ORDER BY sort_order, id
    `,
    [branchId],
  );

  const [balancePages] = await connection.query(
    `
    SELECT
      bp.id,
      bp.slug,
      c.slug AS citySlug,
      bp.menu_title AS menuTitle,
      bp.header_title AS headerTitle,
      bp.file_name AS fileName,
      bp.is_active AS isActive,
      bp.sort_order AS sortOrder
    FROM balance_pages bp
    LEFT JOIN cities c ON c.id = bp.city_id
    WHERE bp.branch_id = ?
    ORDER BY bp.sort_order, bp.id
    `,
    [branchId],
  );

  const [reports] = await connection.query(
    `
    SELECT
      report_key AS reportKey,
      route,
      menu_title AS menuTitle,
      file_name AS fileName,
      allowed_roles AS allowedRoles,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM report_definitions
    WHERE branch_id = ?
    ORDER BY sort_order, id
    `,
    [branchId],
  );

  return {
    branch: branch || null,
    cities,
    balancePages,
    reports: reports.map((report) => ({
      ...report,
      allowedRoles: normalizeAllowedRoles(report.allowedRoles),
    })),
  };
}

function hasDifferentFields(current, desired, fieldNames) {
  return fieldNames.some((fieldName) => {
    const left = normalizeComparableValue(current?.[fieldName]);
    const right = normalizeComparableValue(desired?.[fieldName]);
    return left !== right;
  });
}

function buildPlan(currentState, config) {
  const plan = {
    branch: {
      action: currentState.branch ? "update-or-keep" : "create",
      desired: config.branch,
    },
    cities: [],
    balancePages: [],
    reports: [],
  };

  const currentCitiesBySlug = new Map(
    currentState.cities.map((city) => [String(city.slug), city]),
  );
  for (const city of config.cities) {
    const current = currentCitiesBySlug.get(city.slug) || null;
    plan.cities.push({
      action: current
        ? hasDifferentFields(current, city, [
            "name",
            "shortName",
            "documentPrefix",
            "isActive",
            "sortOrder",
          ])
          ? "update"
          : "keep"
        : "create",
      slug: city.slug,
      desired: city,
    });
  }

  const currentPagesBySlug = new Map(
    currentState.balancePages.map((page) => [String(page.slug), page]),
  );
  for (const page of config.balancePages) {
    const current = currentPagesBySlug.get(page.slug) || null;
    plan.balancePages.push({
      action: current
        ? hasDifferentFields(current, page, [
            "citySlug",
            "menuTitle",
            "headerTitle",
            "fileName",
            "isActive",
            "sortOrder",
          ])
          ? "update"
          : "keep"
        : "create",
      slug: page.slug,
      desired: page,
    });
  }

  const currentReportsByKey = new Map(
    currentState.reports.map((report) => [String(report.reportKey), report]),
  );
  for (const report of config.reports) {
    const current = currentReportsByKey.get(report.reportKey) || null;
    plan.reports.push({
      action: current
        ? hasDifferentFields(current, report, [
            "route",
            "menuTitle",
            "fileName",
            "allowedRoles",
            "isActive",
            "sortOrder",
          ])
          ? "update"
          : "keep"
        : "create",
      reportKey: report.reportKey,
      desired: report,
    });
  }

  return plan;
}

function printPlan(plan, currentState, apply) {
  const branchAction =
    plan.branch.action === "create"
      ? "create"
      : hasDifferentFields(currentState.branch, plan.branch.desired, [
            "slug",
            "name",
            "shortName",
            "isActive",
          ])
        ? "update"
        : "keep";

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(
    `Database: ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "auth"}`,
  );
  console.log(`Bootstrap branch id: ${DEFAULT_BRANCH_ID}`);
  console.log("");
  console.log(`Branch action: ${branchAction}`);
  console.log(
    `Cities: create ${plan.cities.filter((item) => item.action === "create").length}, update ${plan.cities.filter((item) => item.action === "update").length}, keep ${plan.cities.filter((item) => item.action === "keep").length}`,
  );
  console.log(
    `Balance pages: create ${plan.balancePages.filter((item) => item.action === "create").length}, update ${plan.balancePages.filter((item) => item.action === "update").length}, keep ${plan.balancePages.filter((item) => item.action === "keep").length}`,
  );
  console.log(
    `Reports: create ${plan.reports.filter((item) => item.action === "create").length}, update ${plan.reports.filter((item) => item.action === "update").length}, keep ${plan.reports.filter((item) => item.action === "keep").length}`,
  );
}

async function upsertBranch(connection, branch) {
  await connection.query(
    `
    INSERT INTO branches (id, slug, name, short_name, is_active)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      slug = VALUES(slug),
      name = VALUES(name),
      short_name = VALUES(short_name),
      is_active = VALUES(is_active)
    `,
    [
      Number(branch.id),
      branch.slug,
      branch.name,
      branch.shortName,
      branch.isActive ? 1 : 0,
    ],
  );
}

async function upsertCities(connection, branchId, cities) {
  for (const city of cities) {
    await connection.query(
      `
      INSERT INTO cities (
        id,
        branch_id,
        slug,
        name,
        short_name,
        document_prefix,
        is_active,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        branch_id = VALUES(branch_id),
        slug = VALUES(slug),
        name = VALUES(name),
        short_name = VALUES(short_name),
        document_prefix = VALUES(document_prefix),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)
      `,
      [
        Number(city.id),
        Number(branchId),
        city.slug,
        city.name,
        city.shortName,
        city.documentPrefix,
        city.isActive ? 1 : 0,
        Number(city.sortOrder),
      ],
    );
  }
}

async function loadCityIdsBySlug(connection, branchId) {
  const [rows] = await connection.query(
    `
    SELECT id, slug
    FROM cities
    WHERE branch_id = ?
    `,
    [branchId],
  );

  return new Map(rows.map((row) => [String(row.slug), Number(row.id)]));
}

async function upsertBalancePages(connection, branchId, pages, cityIdsBySlug) {
  for (const page of pages) {
    const cityId = page.citySlug ? cityIdsBySlug.get(page.citySlug) || null : null;

    await connection.query(
      `
      INSERT INTO balance_pages (
        branch_id,
        city_id,
        slug,
        menu_title,
        header_title,
        file_name,
        is_active,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        city_id = VALUES(city_id),
        menu_title = VALUES(menu_title),
        header_title = VALUES(header_title),
        file_name = VALUES(file_name),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)
      `,
      [
        Number(branchId),
        cityId,
        page.slug,
        page.menuTitle,
        page.headerTitle,
        page.fileName,
        page.isActive ? 1 : 0,
        Number(page.sortOrder),
      ],
    );
  }
}

async function upsertReports(connection, branchId, reports) {
  for (const report of reports) {
    await connection.query(
      `
      INSERT INTO report_definitions (
        branch_id,
        report_key,
        route,
        menu_title,
        file_name,
        allowed_roles,
        is_active,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        route = VALUES(route),
        menu_title = VALUES(menu_title),
        file_name = VALUES(file_name),
        allowed_roles = VALUES(allowed_roles),
        is_active = VALUES(is_active),
        sort_order = VALUES(sort_order)
      `,
      [
        Number(branchId),
        report.reportKey,
        report.route,
        report.menuTitle,
        report.fileName,
        serializeAllowedRoles(report.allowedRoles),
        report.isActive ? 1 : 0,
        Number(report.sortOrder),
      ],
    );
  }
}

async function applySync(connection, config) {
  await connection.beginTransaction();

  try {
    await upsertBranch(connection, config.branch);
    await upsertCities(connection, config.branch.id, config.cities);
    const cityIdsBySlug = await loadCityIdsBySlug(connection, config.branch.id);
    await upsertBalancePages(
      connection,
      config.branch.id,
      config.balancePages,
      cityIdsBySlug,
    );
    await upsertReports(connection, config.branch.id, config.reports);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has(APPLY_FLAG);
  const allowNonLocal = args.has(ALLOW_NON_LOCAL_FLAG);
  const host = process.env.DB_HOST || "localhost";

  if (apply && !allowNonLocal && !isLocalDatabaseHost(host)) {
    throw new Error(
      `Refusing to apply against non-local DB host "${host}". Re-run with ${ALLOW_NON_LOCAL_FLAG} only after explicit target-DB confirmation.`,
    );
  }

  const connection = await pool.getConnection();

  try {
    const currentState = await loadCurrentState(
      connection,
      defaultBootstrapBranchConfig.branch.id,
    );
    const plan = buildPlan(currentState, defaultBootstrapBranchConfig);
    printPlan(plan, currentState, apply);

    if (!apply) {
      console.log("");
      console.log(
        `Dry run only. Edit api/config/bootstrapBranchConfig.js before cutover, then re-run with ${APPLY_FLAG} to sync branch ${DEFAULT_BRANCH_ID}.`,
      );
      return;
    }

    await applySync(connection, defaultBootstrapBranchConfig);
    console.log("");
    console.log("Bootstrap branch configuration synced successfully.");
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Bootstrap branch sync failed:", error);
  process.exit(1);
});
