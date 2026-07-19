import bcrypt from "bcryptjs";
import UserRepository from "../repositories/User.js";
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

async function ensureCityInBranch(cityId, branchId) {
  const city = await getCityById(cityId);
  if (!city || Number(city.branchId) !== Number(branchId)) {
    throw new BadRequest("Вибране місто не належить до поточної філії");
  }
}

class UserController {
  static async getAllUsers(req, res) {
    try {
      const users = await UserRepository.getAllUsers(getUserBranchId(req.user));
      return res.status(200).json(users);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getUsersTree(req, res) {
    try {
      const [rows] = await UserRepository.findAllWithHierarchy(
        getUserBranchId(req.user),
      );
      return res.status(200).json(rows);
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
    const { userName, user_name, userGuid, role, city } = req.body;
    const branchId = getUserBranchId(req.user);

    try {
      const normalizedRole = Number(role);
      const normalizedCity = Number(city);
      assertKnownRoleId(normalizedRole);

      if (userName) {
        const existingByName = await UserRepository.getUserData(userName);
        if (existingByName && Number(existingByName.id) !== Number(id)) {
          throw new Conflict("Користувач з таким логіном вже існує");
        }
      }

      if (user_name) {
        const existingByUserName = await UserRepository.getUserByUserName(
          user_name,
        );
        if (existingByUserName && Number(existingByUserName.id) !== Number(id)) {
          throw new Conflict("Користувач з таким user_name вже існує");
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
      const result = await UserRepository.updateUserById(
        id,
        {
          userName,
          user_name,
          userGuid,
          role: normalizedRole,
          city: normalizedCity,
        },
        branchId,
      );

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


