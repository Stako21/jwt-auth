import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";
import { BadRequest, Conflict, NotFound } from "../utils/Errors.js";
import { ROLE_IDS } from "../utils/roles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getUserBranchId(user) {
  return Number(user?.branchId || user?.branch_id || 1);
}

export async function getSystemBranch() {
  const envBranchId = Number(process.env.BRANCH_ID);
  if (Number.isInteger(envBranchId) && envBranchId > 0) {
    const [[branch]] = await pool.query(
      `
      SELECT id, slug, name, short_name AS shortName, is_active AS isActive
      FROM branches
      WHERE id = ?
        AND is_active = 1
      LIMIT 1
      `,
      [envBranchId],
    );

    if (!branch) {
      throw new Error(`Configured BRANCH_ID=${envBranchId} was not found or inactive`);
    }

    return branch;
  }

  const envBranchSlug = String(process.env.BRANCH_SLUG || "").trim().toLowerCase();
  if (envBranchSlug) {
    const [[branch]] = await pool.query(
      `
      SELECT id, slug, name, short_name AS shortName, is_active AS isActive
      FROM branches
      WHERE slug = ?
        AND is_active = 1
      LIMIT 1
      `,
      [envBranchSlug],
    );

    if (!branch) {
      throw new Error(`Configured BRANCH_SLUG=${envBranchSlug} was not found or inactive`);
    }

    return branch;
  }

  const [branches] = await pool.query(
    `
    SELECT id, slug, name, short_name AS shortName, is_active AS isActive
    FROM branches
    WHERE is_active = 1
    ORDER BY id
    `,
  );

  if (branches.length === 1) {
    return branches[0];
  }

  if (branches.length === 0) {
    throw new Error("No active branches configured for background tasks");
  }

  throw new Error(
    "Multiple active branches found. Set BRANCH_ID or BRANCH_SLUG for background tasks.",
  );
}

export function getImportDir() {
  return (
    process.env.IMPORT_DIR ||
    path.join(__dirname, "..", "..", "client", "public", "Sorce")
  );
}

export async function getAppConfig(user) {
  const branchId = getUserBranchId(user);

  const [[branch]] = await pool.query(
    `
    SELECT id, slug, name, short_name AS shortName, is_active AS isActive
    FROM branches
    WHERE id = ?
      AND is_active = 1
    LIMIT 1
    `,
    [branchId],
  );

  const [cities] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      slug,
      name,
      short_name AS shortName,
      document_prefix AS documentPrefix,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM cities
    WHERE branch_id = ?
    ORDER BY sort_order, name
    `,
    [branchId],
  );

  const [balancePages] = await pool.query(
    `
    SELECT
      bp.id,
      bp.branch_id AS branchId,
      bp.city_id AS cityId,
      bp.slug,
      bp.menu_title AS menuTitle,
      bp.header_title AS headerTitle,
      bp.file_name AS fileName,
      bp.is_active AS isActive,
      bp.sort_order AS sortOrder,
      c.short_name AS cityShortName,
      c.name AS cityName
    FROM balance_pages bp
    LEFT JOIN cities c ON c.id = bp.city_id
    WHERE bp.branch_id = ?
    ORDER BY bp.sort_order, bp.menu_title
    `,
    [branchId],
  );

  const [reports] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      report_key AS reportKey,
      route,
      menu_title AS menuTitle,
      file_name AS fileName,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM report_definitions
    WHERE branch_id = ?
    ORDER BY sort_order, menu_title
    `,
    [branchId],
  );

  return {
    branch: branch || null,
    cities,
    balancePages,
    reports,
  };
}

export async function getCitiesForBranch(user) {
  const branchId = getUserBranchId(user);
  const [cities] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      slug,
      name,
      short_name AS shortName,
      document_prefix AS documentPrefix,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM cities
    WHERE branch_id = ?
    ORDER BY sort_order, name
    `,
    [branchId],
  );

  return cities;
}

export async function getAllActiveBranches() {
  const [branches] = await pool.query(
    `
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      is_active AS isActive
    FROM branches
    WHERE is_active = 1
    ORDER BY name, id
    `,
  );

  return branches;
}

export async function getVisibleBranchesForUser(user) {
  const currentBranchId = getUserBranchId(user);
  const branchIds = new Set([currentBranchId]);

  if ([ROLE_IDS.Admin, ROLE_IDS.Director].includes(Number(user?.role))) {
    const [rows] = await pool.query(
      `
      SELECT branch_id
      FROM user_branch_access
      WHERE user_id = ?
      `,
      [user.id],
    );

    for (const row of rows) {
      branchIds.add(Number(row.branch_id));
    }
  }

  const ids = Array.from(branchIds).filter(Boolean);
  if (!ids.length) return [];

  const [branches] = await pool.query(
    `
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      is_active AS isActive
    FROM branches
    WHERE is_active = 1
      AND id IN (?)
    ORDER BY name, id
    `,
    [ids],
  );

  return branches;
}

export async function canUserAccessBranch(user, branchId) {
  const visibleBranches = await getVisibleBranchesForUser(user);
  return visibleBranches.some((branch) => Number(branch.id) === Number(branchId));
}

export async function getCurrentBranch(user) {
  const branchId = getUserBranchId(user);
  const [[branch]] = await pool.query(
    `
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      is_active AS isActive
    FROM branches
    WHERE id = ?
    LIMIT 1
    `,
    [branchId],
  );

  return branch || null;
}

function normalizeAccessIds(value) {
  if (!Array.isArray(value)) return [];

  const uniqueIds = new Set();
  for (const rawId of value) {
    const id = Number(rawId);
    if (Number.isInteger(id) && id > 0) {
      uniqueIds.add(id);
    }
  }

  return Array.from(uniqueIds);
}

async function getTargetUserForAccess(currentUser, targetUserId) {
  const branchId = getUserBranchId(currentUser);

  const [[targetUser]] = await pool.query(
    `
    SELECT id, role, city, branch_id AS branchId, is_active AS isActive
    FROM users
    WHERE id = ?
      AND branch_id = ?
      AND is_active = 1
    LIMIT 1
    `,
    [targetUserId, branchId],
  );

  if (!targetUser) {
    throw new NotFound("User not found");
  }

  return targetUser;
}

async function validateBranchAccessIds(branchAccessIds) {
  if (!branchAccessIds.length) return [];

  const [rows] = await pool.query(
    `
    SELECT id
    FROM branches
    WHERE is_active = 1
      AND id IN (?)
    `,
    [branchAccessIds],
  );

  const foundIds = new Set(rows.map((row) => Number(row.id)));
  const invalidIds = branchAccessIds.filter((id) => !foundIds.has(Number(id)));

  if (invalidIds.length) {
    throw new BadRequest("Some branch access ids are invalid");
  }

  return branchAccessIds;
}

async function validateCityAccessIds(branchId, cityAccessIds) {
  if (!cityAccessIds.length) return [];

  const [rows] = await pool.query(
    `
    SELECT id
    FROM cities
    WHERE branch_id = ?
      AND is_active = 1
      AND id IN (?)
    `,
    [branchId, cityAccessIds],
  );

  const foundIds = new Set(rows.map((row) => Number(row.id)));
  const invalidIds = cityAccessIds.filter((id) => !foundIds.has(Number(id)));

  if (invalidIds.length) {
    throw new BadRequest("Some city access ids are invalid");
  }

  return cityAccessIds;
}

async function replaceUserAccess(
  userId,
  branchAccessIds,
  cityAccessIds,
  executor = null,
) {
  const connection = executor || (await pool.getConnection());
  const manageTransaction = !executor;

  try {
    if (manageTransaction) {
      await connection.beginTransaction();
    }

    await connection.query(
      `
      DELETE FROM user_branch_access
      WHERE user_id = ?
      `,
      [userId],
    );

    await connection.query(
      `
      DELETE FROM user_city_access
      WHERE user_id = ?
      `,
      [userId],
    );

    if (branchAccessIds.length) {
      await connection.query(
        `
        INSERT INTO user_branch_access (user_id, branch_id)
        VALUES ?
        `,
        [branchAccessIds.map((branchId) => [userId, branchId])],
      );
    }

    if (cityAccessIds.length) {
      await connection.query(
        `
        INSERT INTO user_city_access (user_id, city_id)
        VALUES ?
        `,
        [cityAccessIds.map((cityId) => [userId, cityId])],
      );
    }

    if (manageTransaction) {
      await connection.commit();
    }
  } catch (error) {
    if (manageTransaction) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (manageTransaction) {
      connection.release();
    }
  }
}

async function getStoredUserBranchAccessIds(userId, executor = pool) {
  const [rows] = await executor.query(
    `
    SELECT branch_id
    FROM user_branch_access
    WHERE user_id = ?
    ORDER BY branch_id
    `,
    [userId],
  );

  return rows.map((row) => Number(row.branch_id)).filter(Boolean);
}

export async function getUserVisibleBranchIds(user) {
  const branchIds = new Set([getUserBranchId(user)]);

  if (![ROLE_IDS.Admin, ROLE_IDS.Director].includes(Number(user?.role))) {
    return Array.from(branchIds);
  }

  const [rows] = await pool.query(
    `
    SELECT branch_id
    FROM user_branch_access
    WHERE user_id = ?
    `,
    [user.id],
  );

  for (const row of rows) {
    branchIds.add(Number(row.branch_id));
  }

  return Array.from(branchIds).filter(Boolean);
}

export async function getUserAccessOptions(user) {
  const [branches, cities] = await Promise.all([
    getVisibleBranchesForUser(user),
    getCitiesForBranch(user),
  ]);

  return {
    branches,
    cities: cities.filter((city) => Boolean(city.isActive)),
  };
}

export async function getUserAccessConfig(currentUser, targetUserId) {
  const targetUser = await getTargetUserForAccess(currentUser, targetUserId);
  const options = await getUserAccessOptions(currentUser);
  const availableBranchIds = new Set(
    (options.branches || []).map((branch) => Number(branch.id)).filter(Boolean),
  );
  const availableCityIds = new Set(
    (options.cities || []).map((city) => Number(city.id)).filter(Boolean),
  );

  const [branchRows, cityRows] = await Promise.all([
    pool.query(
      `
      SELECT branch_id
      FROM user_branch_access
      WHERE user_id = ?
      ORDER BY branch_id
      `,
      [targetUser.id],
    ),
    pool.query(
      `
      SELECT city_id
      FROM user_city_access
      WHERE user_id = ?
      ORDER BY city_id
      `,
      [targetUser.id],
    ),
  ]);

  return {
    userId: targetUser.id,
    role: Number(targetUser.role),
    branchId: Number(targetUser.branchId),
    cityId: Number(targetUser.city),
    branchAccessIds: branchRows[0]
      .map((row) => Number(row.branch_id))
      .filter((branchId) => availableBranchIds.has(branchId)),
    cityAccessIds: cityRows[0]
      .map((row) => Number(row.city_id))
      .filter((cityId) => availableCityIds.has(cityId)),
    availableBranches: options.branches,
    availableCities: options.cities,
  };
}

export async function resolveUserAccessConfig(
  currentUser,
  targetUser,
  payload = {},
  executor = pool,
) {
  const requestedBranchAccessIds = normalizeAccessIds(payload.branchAccessIds);
  const requestedCityAccessIds = normalizeAccessIds(payload.cityAccessIds);

  let branchAccessIds = [];
  let cityAccessIds = [];

  if ([ROLE_IDS.Admin, ROLE_IDS.Director].includes(Number(targetUser.role))) {
    const manageableBranchIds = new Set(
      (await getUserVisibleBranchIds(currentUser))
        .map((branchId) => Number(branchId))
        .filter(
          (branchId) =>
            branchId > 0 && branchId !== Number(targetUser.branchId),
        ),
    );
    const requestedManageableBranchIds = requestedBranchAccessIds.filter(
      (branchId) => Number(branchId) !== Number(targetUser.branchId),
    );
    const outOfScopeBranchIds = requestedManageableBranchIds.filter(
      (branchId) => !manageableBranchIds.has(Number(branchId)),
    );

    if (outOfScopeBranchIds.length) {
      throw new BadRequest(
        "Some branch access ids are outside the current admin branch scope",
      );
    }

    await validateBranchAccessIds(requestedManageableBranchIds);

    const existingBranchAccessIds = await getStoredUserBranchAccessIds(
      targetUser.id,
      executor,
    );
    const preservedBranchAccessIds = existingBranchAccessIds.filter(
      (branchId) => !manageableBranchIds.has(Number(branchId)),
    );

    branchAccessIds = Array.from(
      new Set([...preservedBranchAccessIds, ...requestedManageableBranchIds]),
    );
  }

  if (
    [ROLE_IDS.Accountant, ROLE_IDS.Warehouse].includes(Number(targetUser.role))
  ) {
    cityAccessIds = requestedCityAccessIds.filter(
      (cityId) => Number(cityId) !== Number(targetUser.city),
    );
    await validateCityAccessIds(Number(targetUser.branchId), cityAccessIds);
  }

  return {
    branchAccessIds,
    cityAccessIds,
  };
}

export async function applyUserAccessConfig(
  currentUser,
  targetUser,
  payload = {},
  executor = null,
) {
  const access = await resolveUserAccessConfig(
    currentUser,
    targetUser,
    payload,
    executor || pool,
  );
  await replaceUserAccess(
    targetUser.id,
    access.branchAccessIds,
    access.cityAccessIds,
    executor,
  );

  return access;
}

export async function setUserAccessConfig(currentUser, targetUserId, payload = {}) {
  const targetUser = await getTargetUserForAccess(currentUser, targetUserId);

  await applyUserAccessConfig(currentUser, targetUser, payload);

  return getUserAccessConfig(currentUser, targetUser.id);
}

function normalizeCityPayload(payload = {}) {
  const slug = String(payload.slug || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const shortName = String(payload.shortName || payload.short_name || "").trim();
  const documentPrefix = String(
    payload.documentPrefix || payload.document_prefix || "",
  ).trim();
  const sortOrder = Number.isFinite(Number(payload.sortOrder))
    ? Number(payload.sortOrder)
    : Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : 0;
  const isActive =
    typeof payload.isActive === "boolean"
      ? payload.isActive
      : typeof payload.is_active === "boolean"
        ? payload.is_active
        : true;

  return {
    slug,
    name,
    shortName,
    documentPrefix,
    sortOrder,
    isActive,
  };
}

function normalizeBranchPayload(payload = {}) {
  const slug = String(payload.slug || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  const shortName = String(payload.shortName || payload.short_name || "").trim();
  const isActive =
    typeof payload.isActive === "boolean"
      ? payload.isActive
      : typeof payload.is_active === "boolean"
        ? payload.is_active
        : true;

  return {
    slug,
    name,
    shortName,
    isActive,
  };
}

function validateCityPayload(city) {
  if (!city.slug) throw new BadRequest("slug is required");
  if (!/^[a-z0-9-]+$/.test(city.slug)) {
    throw new BadRequest("slug may contain only lowercase latin letters, digits, and hyphen");
  }
  if (!city.name) throw new BadRequest("name is required");
  if (!city.shortName) throw new BadRequest("shortName is required");
  if (!city.documentPrefix) throw new BadRequest("documentPrefix is required");
  if (!Number.isInteger(city.sortOrder)) {
    throw new BadRequest("sortOrder must be an integer");
  }
}

function validateBranchPayload(branch) {
  if (!branch.slug) throw new BadRequest("slug is required");
  if (!/^[a-z0-9-]+$/.test(branch.slug)) {
    throw new BadRequest(
      "slug may contain only lowercase latin letters, digits, and hyphen",
    );
  }
  if (!branch.name) throw new BadRequest("name is required");
  if (!branch.shortName) throw new BadRequest("shortName is required");
}

async function ensureCityUniqueness({ branchId, slug, documentPrefix, excludeId = null }) {
  const [rows] = await pool.query(
    `
    SELECT id, slug, document_prefix AS documentPrefix
    FROM cities
    WHERE branch_id = ?
      AND (slug = ? OR document_prefix = ?)
      ${excludeId ? "AND id <> ?" : ""}
    `,
    excludeId
      ? [branchId, slug, documentPrefix, excludeId]
      : [branchId, slug, documentPrefix],
  );

  const conflictingSlug = rows.find((row) => row.slug === slug);
  if (conflictingSlug) {
    throw new Conflict("City slug must be unique within branch");
  }

  const conflictingPrefix = rows.find(
    (row) => row.documentPrefix === documentPrefix,
  );
  if (conflictingPrefix) {
    throw new Conflict("City document prefix must be unique within branch");
  }
}

async function ensureBranchUniqueness({ slug, excludeId = null }) {
  const [rows] = await pool.query(
    `
    SELECT id
    FROM branches
    WHERE slug = ?
      ${excludeId ? "AND id <> ?" : ""}
    LIMIT 1
    `,
    excludeId ? [slug, excludeId] : [slug],
  );

  if (rows.length > 0) {
    throw new Conflict("Branch slug must be unique");
  }
}

async function cloneBranchConfiguration(sourceBranchId, targetBranchId, executor) {
  const [[sourceBranch]] = await executor.query(
    `
    SELECT id
    FROM branches
    WHERE id = ?
    LIMIT 1
    `,
    [sourceBranchId],
  );

  if (!sourceBranch) {
    throw new NotFound("Template branch not found");
  }

  const [sourceCities] = await executor.query(
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
    [sourceBranchId],
  );

  const cityIdMap = new Map();

  for (const city of sourceCities) {
    const [result] = await executor.query(
      `
      INSERT INTO cities (
        branch_id,
        slug,
        name,
        short_name,
        document_prefix,
        is_active,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        targetBranchId,
        city.slug,
        city.name,
        city.shortName,
        city.documentPrefix,
        city.isActive ? 1 : 0,
        city.sortOrder,
      ],
    );

    cityIdMap.set(Number(city.id), Number(result.insertId));
  }

  const [sourceBalancePages] = await executor.query(
    `
    SELECT
      city_id AS cityId,
      slug,
      menu_title AS menuTitle,
      header_title AS headerTitle,
      file_name AS fileName,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM balance_pages
    WHERE branch_id = ?
    ORDER BY sort_order, id
    `,
    [sourceBranchId],
  );

  for (const page of sourceBalancePages) {
    await executor.query(
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
      `,
      [
        targetBranchId,
        page.cityId === null ? null : cityIdMap.get(Number(page.cityId)) || null,
        page.slug,
        page.menuTitle,
        page.headerTitle,
        page.fileName,
        page.isActive ? 1 : 0,
        page.sortOrder,
      ],
    );
  }

  const [sourceReports] = await executor.query(
    `
    SELECT
      report_key AS reportKey,
      route,
      menu_title AS menuTitle,
      file_name AS fileName,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM report_definitions
    WHERE branch_id = ?
    ORDER BY sort_order, id
    `,
    [sourceBranchId],
  );

  for (const report of sourceReports) {
    await executor.query(
      `
      INSERT INTO report_definitions (
        branch_id,
        report_key,
        route,
        menu_title,
        file_name,
        is_active,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        targetBranchId,
        report.reportKey,
        report.route,
        report.menuTitle,
        report.fileName,
        report.isActive ? 1 : 0,
        report.sortOrder,
      ],
    );
  }
}

export async function createCity(user, payload) {
  const branchId = getUserBranchId(user);
  const city = normalizeCityPayload(payload);
  validateCityPayload(city);
  await ensureCityUniqueness({
    branchId,
    slug: city.slug,
    documentPrefix: city.documentPrefix,
  });

  const [result] = await pool.query(
    `
    INSERT INTO cities (
      branch_id,
      slug,
      name,
      short_name,
      document_prefix,
      is_active,
      sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      branchId,
      city.slug,
      city.name,
      city.shortName,
      city.documentPrefix,
      city.isActive ? 1 : 0,
      city.sortOrder,
    ],
  );

  return getCityById(result.insertId);
}

export async function updateCurrentBranch(user, payload) {
  const branchId = getUserBranchId(user);
  return updateBranch(branchId, payload);
}

export async function getBranchesConfig() {
  const [branches] = await pool.query(
    `
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      is_active AS isActive
    FROM branches
    ORDER BY is_active DESC, name, id
    `,
  );

  return branches;
}

export async function getBranchById(branchId) {
  const [[branch]] = await pool.query(
    `
    SELECT
      id,
      slug,
      name,
      short_name AS shortName,
      is_active AS isActive
    FROM branches
    WHERE id = ?
    LIMIT 1
    `,
    [branchId],
  );

  return branch || null;
}

export async function createBranch(currentUser, payload) {
  const branch = normalizeBranchPayload(payload);
  const templateBranchId = Number(payload?.templateBranchId);
  const shouldCloneFromTemplate =
    Number.isInteger(templateBranchId) && templateBranchId > 0;

  validateBranchPayload(branch);
  await ensureBranchUniqueness({ slug: branch.slug });
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `
      INSERT INTO branches (
        slug,
        name,
        short_name,
        is_active
      )
      VALUES (?, ?, ?, ?)
      `,
      [branch.slug, branch.name, branch.shortName, branch.isActive ? 1 : 0],
    );

    await connection.query(
      `
      INSERT INTO user_branch_access (user_id, branch_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE branch_id = VALUES(branch_id)
      `,
      [currentUser.id, result.insertId],
    );

    if (shouldCloneFromTemplate) {
      await cloneBranchConfiguration(
        templateBranchId,
        Number(result.insertId),
        connection,
      );
    }

    await connection.commit();
    return getBranchById(result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateBranch(branchId, payload) {
  const branch = normalizeBranchPayload(payload);
  validateBranchPayload(branch);
  await ensureBranchUniqueness({ slug: branch.slug, excludeId: branchId });

  const existing = await getBranchById(branchId);
  if (!existing) throw new NotFound("Branch not found");

  await pool.query(
    `
    UPDATE branches
    SET
      slug = ?,
      name = ?,
      short_name = ?
    WHERE id = ?
    `,
    [branch.slug, branch.name, branch.shortName, branchId],
  );

  return getBranchById(branchId);
}

export async function setBranchActive(currentUser, branchId, isActive) {
  const existing = await getBranchById(branchId);
  if (!existing) throw new NotFound("Branch not found");

  const nextIsActive = Boolean(isActive);
  const currentBranchId = getUserBranchId(currentUser);

  if (!nextIsActive) {
    if (Number(branchId) === Number(currentBranchId)) {
      throw new BadRequest("Current branch cannot be deactivated");
    }

    const [[stats]] = await pool.query(
      `
      SELECT COUNT(*) AS activeCount
      FROM branches
      WHERE is_active = 1
      `,
    );

    if (Number(existing.isActive) && Number(stats?.activeCount || 0) <= 1) {
      throw new BadRequest("At least one active branch must remain");
    }
  }

  await pool.query(
    `
    UPDATE branches
    SET is_active = ?
    WHERE id = ?
    `,
    [nextIsActive ? 1 : 0, branchId],
  );

  return getBranchById(branchId);
}

export async function updateCity(user, cityId, payload) {
  const branchId = getUserBranchId(user);
  const city = normalizeCityPayload(payload);
  validateCityPayload(city);

  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM cities
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [cityId, branchId],
  );

  if (!existing) throw new NotFound("City not found");

  await ensureCityUniqueness({
    branchId,
    slug: city.slug,
    documentPrefix: city.documentPrefix,
    excludeId: cityId,
  });

  await pool.query(
    `
    UPDATE cities
    SET
      slug = ?,
      name = ?,
      short_name = ?,
      document_prefix = ?,
      is_active = ?,
      sort_order = ?
    WHERE id = ?
      AND branch_id = ?
    `,
    [
      city.slug,
      city.name,
      city.shortName,
      city.documentPrefix,
      city.isActive ? 1 : 0,
      city.sortOrder,
      cityId,
      branchId,
    ],
  );

  return getCityById(cityId);
}

export async function setCityActive(user, cityId, isActive) {
  const branchId = getUserBranchId(user);
  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM cities
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [cityId, branchId],
  );

  if (!existing) throw new NotFound("City not found");

  await pool.query(
    `
    UPDATE cities
    SET is_active = ?
    WHERE id = ?
      AND branch_id = ?
    `,
    [isActive ? 1 : 0, cityId, branchId],
  );

  return getCityById(cityId);
}

export async function getBalancePagesForBranch(user) {
  const branchId = getUserBranchId(user);
  const [pages] = await pool.query(
    `
    SELECT
      bp.id,
      bp.branch_id AS branchId,
      bp.city_id AS cityId,
      bp.slug,
      bp.menu_title AS menuTitle,
      bp.header_title AS headerTitle,
      bp.file_name AS fileName,
      bp.is_active AS isActive,
      bp.sort_order AS sortOrder,
      c.short_name AS cityShortName,
      c.name AS cityName
    FROM balance_pages bp
    LEFT JOIN cities c ON c.id = bp.city_id
    WHERE bp.branch_id = ?
    ORDER BY bp.sort_order, bp.menu_title
    `,
    [branchId],
  );

  return pages;
}

export async function getReportsForBranch(user) {
  const branchId = getUserBranchId(user);
  const [reports] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      report_key AS reportKey,
      route,
      menu_title AS menuTitle,
      file_name AS fileName,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM report_definitions
    WHERE branch_id = ?
    ORDER BY sort_order, menu_title
    `,
    [branchId],
  );

  return reports;
}

export async function getImportSources() {
  const [sources] = await pool.query(
    `
    SELECT
      id,
      source_key AS sourceKey,
      file_name AS fileName,
      delete_after_success AS deleteAfterSuccess,
      is_active AS isActive
    FROM import_sources
    ORDER BY source_key
    `,
  );

  return sources;
}

function normalizeBalancePagePayload(payload = {}) {
  const slug = String(payload.slug || "").trim().toLowerCase();
  const menuTitle = String(payload.menuTitle || payload.menu_title || "").trim();
  const headerTitle = String(
    payload.headerTitle || payload.header_title || "",
  ).trim();
  const fileName = String(payload.fileName || payload.file_name || "").trim();
  const cityId =
    payload.cityId === null ||
    payload.cityId === "" ||
    payload.city_id === null ||
    payload.city_id === ""
      ? null
      : Number(payload.cityId ?? payload.city_id);
  const sortOrder = Number.isFinite(Number(payload.sortOrder))
    ? Number(payload.sortOrder)
    : Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : 0;
  const isActive =
    typeof payload.isActive === "boolean"
      ? payload.isActive
      : typeof payload.is_active === "boolean"
        ? payload.is_active
        : true;

  return {
    slug,
    menuTitle,
    headerTitle,
    fileName,
    cityId,
    sortOrder,
    isActive,
  };
}

function validateBalancePagePayload(page) {
  if (!page.slug) throw new BadRequest("slug is required");
  if (!/^[a-z0-9-]+$/.test(page.slug)) {
    throw new BadRequest(
      "slug may contain only lowercase latin letters, digits, and hyphen",
    );
  }
  if (!page.menuTitle) throw new BadRequest("menuTitle is required");
  if (!page.headerTitle) throw new BadRequest("headerTitle is required");
  if (!page.fileName) throw new BadRequest("fileName is required");
  if (!Number.isInteger(page.sortOrder)) {
    throw new BadRequest("sortOrder must be an integer");
  }
  if (page.cityId !== null && (!Number.isInteger(page.cityId) || page.cityId <= 0)) {
    throw new BadRequest("cityId must be a positive integer or null");
  }
}

function normalizeReportPayload(payload = {}) {
  const reportKey = String(payload.reportKey || payload.report_key || "").trim();
  const route = String(payload.route || "").trim();
  const menuTitle = String(payload.menuTitle || payload.menu_title || "").trim();
  const fileName =
    payload.fileName === null || payload.file_name === null
      ? null
      : String(payload.fileName || payload.file_name || "").trim();
  const sortOrder = Number.isFinite(Number(payload.sortOrder))
    ? Number(payload.sortOrder)
    : Number.isFinite(Number(payload.sort_order))
      ? Number(payload.sort_order)
      : 0;
  const isActive =
    typeof payload.isActive === "boolean"
      ? payload.isActive
      : typeof payload.is_active === "boolean"
        ? payload.is_active
        : true;

  return {
    reportKey,
    route,
    menuTitle,
    fileName,
    sortOrder,
    isActive,
  };
}

function validateReportPayload(report) {
  if (!report.reportKey) throw new BadRequest("reportKey is required");
  if (!/^[a-z0-9-]+$/.test(report.reportKey)) {
    throw new BadRequest(
      "reportKey may contain only lowercase latin letters, digits, and hyphen",
    );
  }
  if (!report.route) throw new BadRequest("route is required");
  if (!report.route.startsWith("/")) {
    throw new BadRequest("route must start with /");
  }
  if (!report.menuTitle) throw new BadRequest("menuTitle is required");
  if (!Number.isInteger(report.sortOrder)) {
    throw new BadRequest("sortOrder must be an integer");
  }
}

function normalizeImportSourcePayload(payload = {}) {
  const fileName = String(payload.fileName || payload.file_name || "").trim();
  const deleteAfterSuccess =
    typeof payload.deleteAfterSuccess === "boolean"
      ? payload.deleteAfterSuccess
      : typeof payload.delete_after_success === "boolean"
        ? payload.delete_after_success
        : true;
  const isActive =
    typeof payload.isActive === "boolean"
      ? payload.isActive
      : typeof payload.is_active === "boolean"
        ? payload.is_active
        : true;

  return {
    fileName,
    deleteAfterSuccess,
    isActive,
  };
}

function validateImportSourcePayload(source) {
  if (!source.fileName) throw new BadRequest("fileName is required");
}

async function ensureBalancePageCityBelongsToBranch(branchId, cityId) {
  if (!cityId) return;

  const [[city]] = await pool.query(
    `
    SELECT id
    FROM cities
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [cityId, branchId],
  );

  if (!city) {
    throw new BadRequest("Selected city does not belong to current branch");
  }
}

async function ensureBalancePageUniqueness({
  branchId,
  slug,
  fileName,
  excludeId = null,
}) {
  const [rows] = await pool.query(
    `
    SELECT id, slug, file_name AS fileName
    FROM balance_pages
    WHERE branch_id = ?
      AND (slug = ? OR file_name = ?)
      ${excludeId ? "AND id <> ?" : ""}
    `,
    excludeId
      ? [branchId, slug, fileName, excludeId]
      : [branchId, slug, fileName],
  );

  const conflictingSlug = rows.find((row) => row.slug === slug);
  if (conflictingSlug) {
    throw new Conflict("Balance page slug must be unique within branch");
  }

  const conflictingFile = rows.find((row) => row.fileName === fileName);
  if (conflictingFile) {
    throw new Conflict("Balance page fileName must be unique within branch");
  }
}

async function ensureReportUniqueness({
  branchId,
  reportKey,
  route,
  excludeId = null,
}) {
  const [rows] = await pool.query(
    `
    SELECT id, report_key AS reportKey, route
    FROM report_definitions
    WHERE branch_id = ?
      AND (report_key = ? OR route = ?)
      ${excludeId ? "AND id <> ?" : ""}
    `,
    excludeId
      ? [branchId, reportKey, route, excludeId]
      : [branchId, reportKey, route],
  );

  const conflictingKey = rows.find((row) => row.reportKey === reportKey);
  if (conflictingKey) {
    throw new Conflict("Report key must be unique within branch");
  }

  const conflictingRoute = rows.find((row) => row.route === route);
  if (conflictingRoute) {
    throw new Conflict("Report route must be unique within branch");
  }
}

export async function createBalancePage(user, payload) {
  const branchId = getUserBranchId(user);
  const page = normalizeBalancePagePayload(payload);
  validateBalancePagePayload(page);
  await ensureBalancePageCityBelongsToBranch(branchId, page.cityId);
  await ensureBalancePageUniqueness({
    branchId,
    slug: page.slug,
    fileName: page.fileName,
  });

  const [result] = await pool.query(
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
    `,
    [
      branchId,
      page.cityId,
      page.slug,
      page.menuTitle,
      page.headerTitle,
      page.fileName,
      page.isActive ? 1 : 0,
      page.sortOrder,
    ],
  );

  return getBalancePageById(branchId, result.insertId);
}

export async function updateBalancePage(user, pageId, payload) {
  const branchId = getUserBranchId(user);
  const page = normalizeBalancePagePayload(payload);
  validateBalancePagePayload(page);

  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM balance_pages
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [pageId, branchId],
  );

  if (!existing) throw new NotFound("Balance page not found");

  await ensureBalancePageCityBelongsToBranch(branchId, page.cityId);
  await ensureBalancePageUniqueness({
    branchId,
    slug: page.slug,
    fileName: page.fileName,
    excludeId: pageId,
  });

  await pool.query(
    `
    UPDATE balance_pages
    SET
      city_id = ?,
      slug = ?,
      menu_title = ?,
      header_title = ?,
      file_name = ?,
      is_active = ?,
      sort_order = ?
    WHERE id = ?
      AND branch_id = ?
    `,
    [
      page.cityId,
      page.slug,
      page.menuTitle,
      page.headerTitle,
      page.fileName,
      page.isActive ? 1 : 0,
      page.sortOrder,
      pageId,
      branchId,
    ],
  );

  return getBalancePageById(branchId, pageId);
}

export async function setBalancePageActive(user, pageId, isActive) {
  const branchId = getUserBranchId(user);
  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM balance_pages
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [pageId, branchId],
  );

  if (!existing) throw new NotFound("Balance page not found");

  await pool.query(
    `
    UPDATE balance_pages
    SET is_active = ?
    WHERE id = ?
      AND branch_id = ?
    `,
    [isActive ? 1 : 0, pageId, branchId],
  );

  return getBalancePageById(branchId, pageId);
}

export async function updateReportDefinition(user, reportId, payload) {
  const branchId = getUserBranchId(user);
  const report = normalizeReportPayload(payload);
  validateReportPayload(report);

  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM report_definitions
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [reportId, branchId],
  );

  if (!existing) throw new NotFound("Report definition not found");

  await ensureReportUniqueness({
    branchId,
    reportKey: report.reportKey,
    route: report.route,
    excludeId: reportId,
  });

  await pool.query(
    `
    UPDATE report_definitions
    SET
      report_key = ?,
      route = ?,
      menu_title = ?,
      file_name = ?,
      is_active = ?,
      sort_order = ?
    WHERE id = ?
      AND branch_id = ?
    `,
    [
      report.reportKey,
      report.route,
      report.menuTitle,
      report.fileName || null,
      report.isActive ? 1 : 0,
      report.sortOrder,
      reportId,
      branchId,
    ],
  );

  return getReportById(branchId, reportId);
}

export async function setReportDefinitionActive(user, reportId, isActive) {
  const branchId = getUserBranchId(user);
  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM report_definitions
    WHERE id = ?
      AND branch_id = ?
    LIMIT 1
    `,
    [reportId, branchId],
  );

  if (!existing) throw new NotFound("Report definition not found");

  await pool.query(
    `
    UPDATE report_definitions
    SET is_active = ?
    WHERE id = ?
      AND branch_id = ?
    `,
    [isActive ? 1 : 0, reportId, branchId],
  );

  return getReportById(branchId, reportId);
}

export async function updateImportSource(sourceId, payload) {
  const source = normalizeImportSourcePayload(payload);
  validateImportSourcePayload(source);

  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM import_sources
    WHERE id = ?
    LIMIT 1
    `,
    [sourceId],
  );

  if (!existing) throw new NotFound("Import source not found");

  await pool.query(
    `
    UPDATE import_sources
    SET
      file_name = ?,
      delete_after_success = ?,
      is_active = ?
    WHERE id = ?
    `,
    [
      source.fileName,
      source.deleteAfterSuccess ? 1 : 0,
      source.isActive ? 1 : 0,
      sourceId,
    ],
  );

  return getImportSourceById(sourceId);
}

export async function setImportSourceActive(sourceId, isActive) {
  const [[existing]] = await pool.query(
    `
    SELECT id
    FROM import_sources
    WHERE id = ?
    LIMIT 1
    `,
    [sourceId],
  );

  if (!existing) throw new NotFound("Import source not found");

  await pool.query(
    `
    UPDATE import_sources
    SET is_active = ?
    WHERE id = ?
    `,
    [isActive ? 1 : 0, sourceId],
  );

  return getImportSourceById(sourceId);
}

export async function getBalancePageBySlug(user, slug) {
  const branchId = getUserBranchId(user);

  const [[page]] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      city_id AS cityId,
      slug,
      menu_title AS menuTitle,
      header_title AS headerTitle,
      file_name AS fileName,
      is_active AS isActive
    FROM balance_pages
    WHERE branch_id = ?
      AND slug = ?
      AND is_active = 1
    LIMIT 1
    `,
    [branchId, slug],
  );

  return page || null;
}

export async function getImportSourceConfig(sourceKey, fallbackFileName = null) {
  const [[source]] = await pool.query(
    `
    SELECT
      id,
      source_key AS sourceKey,
      file_name AS fileName,
      delete_after_success AS deleteAfterSuccess,
      is_active AS isActive
    FROM import_sources
    WHERE source_key = ?
    LIMIT 1
    `,
    [sourceKey],
  );

  if (source) return source;

  return fallbackFileName
    ? {
        id: null,
        sourceKey,
        fileName: fallbackFileName,
        deleteAfterSuccess: false,
        isActive: true,
      }
    : null;
}

function applyBranchImportTokens(fileName, branch) {
  return String(fileName || "")
    .replaceAll("{branchId}", String(branch.id))
    .replaceAll("{branchSlug}", String(branch.slug || ""))
    .replaceAll("{branchShortName}", String(branch.shortName || ""));
}

function normalizeImportRelativePath(fileName) {
  return path
    .normalize(String(fileName || "").trim())
    .replace(/^([/\\])+/, "");
}

function isPathInsideDir(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function buildImportPathCandidates(importDir, fileName, branch) {
  const relativeFileName = normalizeImportRelativePath(fileName);
  if (!relativeFileName) return [];

  const tokenizedFileName = normalizeImportRelativePath(
    applyBranchImportTokens(relativeFileName, branch),
  );
  const hasExplicitBranchTokens = tokenizedFileName !== relativeFileName;

  const candidates = [
    hasExplicitBranchTokens ? path.resolve(importDir, tokenizedFileName) : null,
    path.resolve(importDir, branch.slug, relativeFileName),
    path.resolve(importDir, String(branch.id), relativeFileName),
    path.resolve(importDir, relativeFileName),
  ].filter(Boolean);

  return Array.from(
    new Set(candidates.filter((candidate) => isPathInsideDir(importDir, candidate))),
  );
}

async function resolveExistingImportPath(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next candidate path.
    }
  }

  return candidates[0] || null;
}

export async function getImportSourcePath(sourceKey, fallbackFileName) {
  const source = await getImportSourceConfig(sourceKey, fallbackFileName);
  if (!source?.fileName) return null;

  const branch = await getSystemBranch();
  const importDir = path.resolve(getImportDir());
  const fileCandidates = buildImportPathCandidates(importDir, source.fileName, branch);
  const filePath = await resolveExistingImportPath(fileCandidates);

  return {
    ...source,
    branch,
    importDir,
    fileCandidates,
    filePath,
  };
}

export async function getBalancePageById(branchId, pageId) {
  const [[page]] = await pool.query(
    `
    SELECT
      bp.id,
      bp.branch_id AS branchId,
      bp.city_id AS cityId,
      bp.slug,
      bp.menu_title AS menuTitle,
      bp.header_title AS headerTitle,
      bp.file_name AS fileName,
      bp.is_active AS isActive,
      bp.sort_order AS sortOrder,
      c.short_name AS cityShortName,
      c.name AS cityName
    FROM balance_pages bp
    LEFT JOIN cities c ON c.id = bp.city_id
    WHERE bp.branch_id = ?
      AND bp.id = ?
    LIMIT 1
    `,
    [branchId, pageId],
  );

  return page || null;
}

export async function getReportById(branchId, reportId) {
  const [[report]] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      report_key AS reportKey,
      route,
      menu_title AS menuTitle,
      file_name AS fileName,
      is_active AS isActive,
      sort_order AS sortOrder
    FROM report_definitions
    WHERE branch_id = ?
      AND id = ?
    LIMIT 1
    `,
    [branchId, reportId],
  );

  return report || null;
}

export async function getImportSourceById(sourceId) {
  const [[source]] = await pool.query(
    `
    SELECT
      id,
      source_key AS sourceKey,
      file_name AS fileName,
      delete_after_success AS deleteAfterSuccess,
      is_active AS isActive
    FROM import_sources
    WHERE id = ?
    LIMIT 1
    `,
    [sourceId],
  );

  return source || null;
}

export async function getCityById(cityId) {
  if (!cityId) return null;

  const [[city]] = await pool.query(
    `
    SELECT
      id,
      branch_id AS branchId,
      slug,
      name,
      short_name AS shortName,
      document_prefix AS documentPrefix,
      is_active AS isActive
    FROM cities
    WHERE id = ?
    LIMIT 1
    `,
    [cityId],
  );

  return city || null;
}
