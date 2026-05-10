import UserRepository from "../repositories/User.js";
import { BadRequest, NotFound } from "../utils/Errors.js";
import { ROLE_IDS, roleName } from "../utils/roles.js";

const SUPERVISOR_ROLE_BY_CHILD_ROLE = {
  [ROLE_IDS.TA]: ROLE_IDS.SV,
  [ROLE_IDS.SV]: ROLE_IDS.NTO,
};

const SUBORDINATE_ROLE_BY_PARENT_ROLE = {
  [ROLE_IDS.SV]: ROLE_IDS.TA,
  [ROLE_IDS.NTO]: ROLE_IDS.SV,
};

export function isKnownRoleId(roleId) {
  const normalizedRoleId = Number(roleId);
  return Object.values(ROLE_IDS).includes(normalizedRoleId);
}

export function canRoleHaveSupervisor(roleId) {
  return Object.hasOwn(SUPERVISOR_ROLE_BY_CHILD_ROLE, Number(roleId));
}

export function assertKnownRoleId(roleId) {
  if (!isKnownRoleId(roleId)) {
    throw new BadRequest("Некоректна роль");
  }
}

export function assertSupervisorRoleForChildRole(childRole, supervisorRole) {
  const normalizedChildRole = Number(childRole);
  const normalizedSupervisorRole = Number(supervisorRole);
  const expectedSupervisorRole = SUPERVISOR_ROLE_BY_CHILD_ROLE[normalizedChildRole];

  if (!expectedSupervisorRole) {
    throw new BadRequest(
      `Роль ${roleName(normalizedChildRole)} не може мати керівника`,
    );
  }

  if (normalizedSupervisorRole !== expectedSupervisorRole) {
    throw new BadRequest(
      `Для ролі ${roleName(normalizedChildRole)} можна призначити лише керівника з роллю ${roleName(expectedSupervisorRole)}`,
    );
  }
}

export function assertRoleChangeKeepsHierarchyValid({
  nextRole,
  supervisor,
  subordinates,
}) {
  const normalizedNextRole = Number(nextRole);

  if (supervisor) {
    if (!canRoleHaveSupervisor(normalizedNextRole)) {
      throw new BadRequest(
        `Перед зміною ролі на ${roleName(normalizedNextRole)} потрібно прибрати поточного керівника`,
      );
    }

    assertSupervisorRoleForChildRole(normalizedNextRole, Number(supervisor.role));
  }

  if (!subordinates?.length) {
    return;
  }

  const expectedSubordinateRole = SUBORDINATE_ROLE_BY_PARENT_ROLE[normalizedNextRole];

  if (!expectedSubordinateRole) {
    throw new BadRequest(
      `Перед зміною ролі на ${roleName(normalizedNextRole)} потрібно перепризначити поточних підлеглих`,
    );
  }

  const incompatibleChild = subordinates.find(
    (child) => Number(child.role) !== expectedSubordinateRole,
  );

  if (incompatibleChild) {
    throw new BadRequest(
      `${roleName(normalizedNextRole)} не може керувати роллю ${roleName(Number(incompatibleChild.role))}`,
    );
  }
}

export async function getBranchUserOrThrow(userId, branchId) {
  const user = await UserRepository.getActiveUserByIdInBranch(userId, branchId);
  if (!user) {
    throw new NotFound("Користувача не знайдено в поточній філії");
  }
  return user;
}

export async function assertSupervisorAssignmentAllowed({
  childId,
  supervisorId,
  branchId,
}) {
  const child = await getBranchUserOrThrow(childId, branchId);
  const supervisor = await getBranchUserOrThrow(supervisorId, branchId);

  assertKnownRoleId(child.role);
  assertKnownRoleId(supervisor.role);
  assertSupervisorRoleForChildRole(Number(child.role), Number(supervisor.role));

  return { child, supervisor };
}

export async function loadBranchUserHierarchy(userId, branchId) {
  const [user, supervisor, subordinates] = await Promise.all([
    getBranchUserOrThrow(userId, branchId),
    UserRepository.getDirectSupervisor(userId, branchId),
    UserRepository.getDirectSubordinates(userId, branchId),
  ]);

  return { user, supervisor, subordinates };
}
