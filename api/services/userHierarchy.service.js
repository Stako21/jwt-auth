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
    throw new BadRequest("Invalid role");
  }
}

export function assertSupervisorRoleForChildRole(childRole, supervisorRole) {
  const normalizedChildRole = Number(childRole);
  const normalizedSupervisorRole = Number(supervisorRole);
  const expectedSupervisorRole = SUPERVISOR_ROLE_BY_CHILD_ROLE[normalizedChildRole];

  if (!expectedSupervisorRole) {
    throw new BadRequest(
      `Role ${roleName(normalizedChildRole)} cannot have a supervisor`,
    );
  }

  if (normalizedSupervisorRole !== expectedSupervisorRole) {
    throw new BadRequest(
      `${roleName(normalizedChildRole)} can be assigned only to ${roleName(expectedSupervisorRole)}`,
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
        `Remove the current supervisor before changing role to ${roleName(normalizedNextRole)}`,
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
      `Reassign current subordinates before changing role to ${roleName(normalizedNextRole)}`,
    );
  }

  const incompatibleChild = subordinates.find(
    (child) => Number(child.role) !== expectedSubordinateRole,
  );

  if (incompatibleChild) {
    throw new BadRequest(
      `${roleName(normalizedNextRole)} cannot supervise ${roleName(Number(incompatibleChild.role))}`,
    );
  }
}

export async function getBranchUserOrThrow(userId, branchId) {
  const user = await UserRepository.getActiveUserByIdInBranch(userId, branchId);
  if (!user) {
    throw new NotFound("User not found in current branch");
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
