import bcrypt from "bcryptjs";
import UserRepository from "../repositories/User.js";
import pool from "../db.cjs";
import ErrorsUtils from "../utils/Errors.js";
import { BadRequest, Conflict, NotFound } from "../utils/Errors.js";
import { getCityById, getUserBranchId } from "../services/appConfig.service.js";
import {
  assertKnownRoleId,
  assertRoleChangeKeepsHierarchyValid,
  assertSupervisorAssignmentAllowed,
  canRoleHaveSupervisor,
  loadBranchUserHierarchy,
} from "../services/userHierarchy.service.js";
import {
  attachUserAssortmentData,
  listKnownAssortments,
  replaceUserAssortments,
  resolveUserAssortments,
} from "../services/userAssortment.service.js";
import { ROLE_IDS } from "../utils/roles.js";

async function ensureCityInBranch(cityId, branchId) {
  const city = await getCityById(cityId);
  if (!city || Number(city.branchId) !== Number(branchId)) {
    throw new BadRequest("Вибране місто не належить до поточної філії");
  }
}

class UserController {
  static async getAllUsers(req, res) {
    try {
      const branchId = getUserBranchId(req.user);
      const users = await UserRepository.getAllUsers(branchId);
      const userIds = users.map((user) => Number(user.id));
      const positions = await UserRepository.getSalesAgentPositionsForUsers(
        userIds,
        branchId,
      );
      const assignments = await UserRepository.getUserAssortmentsForUsers(
        userIds,
        branchId,
      );
      return res
        .status(200)
        .json(attachUserAssortmentData(users, assignments, positions));
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getUsersTree(req, res) {
    try {
      const branchId = getUserBranchId(req.user);
      const [rows] = await UserRepository.findAllWithHierarchy(branchId);
      const positions = await UserRepository.getSalesAgentPositionsForUsers(
        rows.map((user) => Number(user.id)),
        branchId,
      );
      const assignments = await UserRepository.getUserAssortmentsForUsers(
        rows.map((user) => Number(user.id)),
        branchId,
      );
      return res
        .status(200)
        .json(attachUserAssortmentData(rows, assignments, positions));
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getUserDetail(req, res) {
    try {
      const branchId = getUserBranchId(req.user);
      const user = await UserRepository.getActiveUserByIdInBranch(
        Number(req.params.id),
        branchId,
      );
      if (!user) throw new NotFound("Користувача не знайдено");
      const positions = await UserRepository.getSalesAgentPositionsForUsers(
        [Number(user.id)],
        branchId,
      );
      const assignments = await UserRepository.getUserAssortmentsForUsers(
        [Number(user.id)],
        branchId,
      );
      return res
        .status(200)
        .json(attachUserAssortmentData([user], assignments, positions)[0]);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getSalesAgents(req, res) {
    try {
      const salesAgents = await UserRepository.getSalesAgents(getUserBranchId(req.user));
      return res.status(200).json(salesAgents);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getAssortments(req, res) {
    try {
      const assortments = await listKnownAssortments(getUserBranchId(req.user));
      return res.status(200).json(assortments);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getAssortmentDiagnostics(req, res) {
    try {
      const branchId = getUserBranchId(req.user);
      const [users] = await UserRepository.findAllWithHierarchy(branchId);
      const positions = await UserRepository.getSalesAgentPositionsForUsers(
        users.map((user) => Number(user.id)),
        branchId,
      );
      const assignments = await UserRepository.getUserAssortmentsForUsers(
        users.map((user) => Number(user.id)),
        branchId,
      );
      const enrichedUsers = attachUserAssortmentData(users, assignments, positions);
      const svUsers = enrichedUsers.filter((user) => Number(user.role) === ROLE_IDS.SV);
      const svWithoutAssortment = svUsers.filter((user) => !user.assortments.length);
      const svMultipleWithoutPermission = svUsers.filter(
        (user) => !user.multi_assortment_allowed && user.assortments.length > 1,
      );
      const nto = enrichedUsers.filter((user) => Number(user.role) === ROLE_IDS.NTO);
      const hierarchyWarnings = [];
      for (const sv of svUsers.filter((user) => user.assortments.length)) {
        const allowedGuids = new Set(sv.assortments.map((item) => item.guid));
        const taChildren = enrichedUsers.filter(
          (user) =>
            Number(user.parent_user_id) === Number(sv.id) &&
            Number(user.role) === ROLE_IDS.TA,
        );
        for (const ta of taChildren) {
          const effectiveGuids = new Set(
            ta.effective_assortments.map((item) => item.guid),
          );
          const hasAllowedPosition = [...allowedGuids].some((guid) =>
            effectiveGuids.has(guid),
          );
          if (!hasAllowedPosition) {
            hierarchyWarnings.push({
              code: "TA_WITHOUT_SV_ASSORTMENT_POSITION",
              sv_id: Number(sv.id),
              ta_id: Number(ta.id),
              allowed_assortment_guids: [...allowedGuids],
            });
          }
        }
      }

      return res.status(200).json({
        sv_without_assortment: svWithoutAssortment,
        sv_multi_without_permission: svMultipleWithoutPermission,
        sv_single_with_multiple_assortments: svMultipleWithoutPermission,
        nto,
        hierarchy_warnings: hierarchyWarnings,
      });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async deleteUser(req, res) {
    const { id } = req.params;
    try {
      const userDeleted = await UserRepository.deleteUserById(
        id,
        getUserBranchId(req.user),
      );

      if (userDeleted) {
        return res.status(200).json({ message: "Користувач деактивований" });
      }

      return res.status(404).json({ error: "Користувача не знайдено" });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async changePassword(req, res) {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Пароль має містити щонайменше 6 символів" });
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const result = await UserRepository.updateUserPassword(
        id,
        hashedPassword,
        getUserBranchId(req.user),
      );

      if (!result.affectedRows) {
        throw new NotFound("Користувача не знайдено");
      }

      return res.status(200).json({ message: "Пароль успішно оновлено" });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async updateUser(req, res) {
    const { id } = req.params;
    const {
      userName,
      user_name,
      userGuid,
      role,
      city,
      assortment_guids: assortmentGuids,
      multi_assortment_allowed: multiAssortmentAllowed,
    } = req.body;
    const branchId = getUserBranchId(req.user);

    try {
      const normalizedRole = Number(role);
      const normalizedCity = Number(city);
      assertKnownRoleId(normalizedRole);
      const normalizedMultiAssortmentAllowed =
        normalizedRole === ROLE_IDS.SV && Boolean(multiAssortmentAllowed);
      const assortments = await resolveUserAssortments({
        role: normalizedRole,
        assortmentGuids,
        multiAssortmentAllowed: normalizedMultiAssortmentAllowed,
        branchId,
      });

      if (userName) {
        const existingByName = await UserRepository.getUserData(userName);
        if (existingByName && Number(existingByName.id) !== Number(id)) {
          throw new Conflict("Користувач з таким логіном вже існує");
        }
      }

      if (userGuid) {
        const existingByGuid = await UserRepository.getUserByGuid(
          userGuid,
          branchId,
        );
        if (existingByGuid && Number(existingByGuid.id) !== Number(id)) {
          throw new Conflict("Користувач з таким UserGUID вже існує у філії");
        }
      }

      await ensureCityInBranch(normalizedCity, branchId);
      const { supervisor, subordinates } = await loadBranchUserHierarchy(id, branchId);
      assertRoleChangeKeepsHierarchyValid({
        nextRole: normalizedRole,
        supervisor,
        subordinates,
      });
      const connection = await pool.getConnection();
      let result;
      try {
        await connection.beginTransaction();
        result = await UserRepository.updateUserById(
          id,
          {
            userName,
            user_name,
            userGuid,
            multiAssortmentAllowed: normalizedMultiAssortmentAllowed,
            role: normalizedRole,
            city: normalizedCity,
          },
          branchId,
          connection,
        );
        if (!result.affectedRows) throw new NotFound("Користувача не знайдено");
        await replaceUserAssortments(connection, Number(id), assortments);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      if (!result.affectedRows) {
        throw new NotFound("Користувача не знайдено");
      }

      return res.status(200).json({ message: "Користувача успішно оновлено" });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async setSupervisor(req, res) {
    const { id } = req.params;
    const { supervisorId } = req.body;
    const branchId = getUserBranchId(req.user);

    if (Number(id) === Number(supervisorId)) {
      return res
        .status(400)
        .json({ message: "Користувач не може бути керівником самого себе" });
    }

    try {
      const { user } = await loadBranchUserHierarchy(id, branchId);

      if (!supervisorId) {
        await UserRepository.removeParent(id, branchId);
        return res.status(200).json({ success: true });
      }

      if (!canRoleHaveSupervisor(user.role)) {
        throw new BadRequest("Керівника можна призначати лише для ролей SV та TA");
      }

      await assertSupervisorAssignmentAllowed({
        childId: Number(id),
        supervisorId: Number(supervisorId),
        branchId,
      });

      const result = await UserRepository.setParent(
        Number(id),
        Number(supervisorId),
        branchId,
      );

      if (!result.affectedRows) {
        throw new NotFound("Користувача або керівника не знайдено в поточній філії");
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default UserController;


