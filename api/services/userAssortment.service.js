import pool from "../db.cjs";
import { BadRequest } from "../utils/Errors.js";
import { ROLE_IDS } from "../utils/roles.js";

export function normalizeNullableGuid(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

export function normalizeAssortmentGuids(values) {
  if (values === null || typeof values === "undefined" || values === "") return [];
  if (!Array.isArray(values)) throw new BadRequest("ASSORTMENT_GUIDS_MUST_BE_ARRAY");
  return [...new Set(values.map(normalizeNullableGuid).filter(Boolean))];
}

export async function listKnownAssortments(branchId, executor = pool) {
  const [rows] = await executor.query(
    `SELECT assortment_guid AS guid, MAX(assortment_name) AS name
     FROM sales_agents
     WHERE branch_id = ?
       AND is_active_1c = 1
       AND assortment_guid IS NOT NULL
       AND assortment_guid <> ''
       AND assortment_name IS NOT NULL
       AND assortment_name <> ''
     GROUP BY assortment_guid
     ORDER BY name`,
    [branchId],
  );
  return rows;
}

export async function resolveUserAssortments({
  role,
  assortmentGuids,
  multiAssortmentAllowed = false,
  branchId,
  executor = pool,
}) {
  const normalizedRole = Number(role);
  const guids = normalizeAssortmentGuids(assortmentGuids);

  if (normalizedRole === ROLE_IDS.TA) return [];

  if (normalizedRole === ROLE_IDS.SV) {
    if (guids.length === 0) throw new BadRequest("SV_ASSORTMENT_REQUIRED");
    if (!multiAssortmentAllowed && guids.length !== 1) {
      throw new BadRequest("SV_MULTIPLE_ASSORTMENTS_NOT_ALLOWED");
    }
  }

  if (!guids.length) return [];

  const [rows] = await executor.query(
    `SELECT assortment_guid AS guid, MAX(assortment_name) AS name
     FROM sales_agents
     WHERE branch_id = ?
       AND is_active_1c = 1
       AND assortment_guid IN (?)
     GROUP BY assortment_guid`,
    [branchId, guids],
  );
  const byGuid = new Map(rows.map((row) => [row.guid, row]));
  const unknown = guids.filter((guid) => !byGuid.has(guid));
  if (unknown.length) throw new BadRequest("UNKNOWN_ASSORTMENT_GUID");

  return guids.map((guid) => ({ guid, name: byGuid.get(guid).name }));
}

export async function replaceUserAssortments(
  executor,
  userId,
  assortments,
) {
  await executor.query("DELETE FROM user_assortments WHERE user_id = ?", [userId]);
  for (const assortment of assortments) {
    await executor.query(
      `INSERT INTO user_assortments (user_id, assortment_guid, assortment_name)
       VALUES (?, ?, ?)`,
      [userId, assortment.guid, assortment.name],
    );
  }
}

export function attachUserAssortmentData(users, assignments, positions) {
  const assignmentsByUser = new Map();
  for (const assignment of assignments) {
    const current = assignmentsByUser.get(Number(assignment.user_id)) || [];
    current.push({ guid: assignment.assortment_guid, name: assignment.assortment_name });
    assignmentsByUser.set(Number(assignment.user_id), current);
  }

  const positionsByUser = new Map();
  for (const position of positions) {
    const current = positionsByUser.get(Number(position.user_id)) || [];
    current.push(position);
    positionsByUser.set(Number(position.user_id), current);
  }

  return users.map((user) => {
    // assortment_guid/name on users are deprecated migration-024 fields.
    // They are deliberately removed from runtime DTOs after migration 025.
    const runtimeUser = { ...user };
    delete runtimeUser.assortment_guid;
    delete runtimeUser.assortment_name;
    const userPositions = positionsByUser.get(Number(user.id)) || [];
    const effectiveByGuid = new Map();
    for (const position of userPositions) {
      if (!position.is_active_1c || !position.assortment_guid) continue;
      effectiveByGuid.set(position.assortment_guid, {
        guid: position.assortment_guid,
        name: position.assortment_name,
      });
    }
    const isTa = Number(user.role) === ROLE_IDS.TA;
    return {
      ...runtimeUser,
      multi_assortment_allowed: Boolean(user.multi_assortment_allowed),
      assortments: isTa ? [] : assignmentsByUser.get(Number(user.id)) || [],
      sales_agent_positions: userPositions,
      effective_assortments: isTa ? [...effectiveByGuid.values()] : [],
    };
  });
}
