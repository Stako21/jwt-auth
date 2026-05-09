import bcrypt from "bcryptjs";
import TokenService from "./Token.js";
import pool from "../db.cjs";
import {
  BadRequest,
  Forbidden,
  NotFound,
  Unauthorized,
} from "../utils/Errors.js";
import RefreshSessionsRepository from "../repositories/RefreshSession.js";
import UserRepository from "../repositories/User.js";
import { ACCESS_TOKEN_EXPIRATION } from "../constants.js";
import { applyUserAccessConfig, canUserAccessBranch } from "./appConfig.service.js";
import {
  assertKnownRoleId,
  assertSupervisorRoleForChildRole,
  canRoleHaveSupervisor,
} from "./userHierarchy.service.js";

async function resolveActiveBranchId(userData, requestedBranchId = null) {
  const fallbackBranchId = Number(userData.branch_id);
  const nextBranchId = Number(requestedBranchId);

  if (!Number.isInteger(nextBranchId) || nextBranchId <= 0) {
    return fallbackBranchId;
  }

  if (nextBranchId === fallbackBranchId) {
    return fallbackBranchId;
  }

  const canAccess = await canUserAccessBranch(
    {
      id: userData.id,
      role: userData.role,
      branchId: fallbackBranchId,
    },
    nextBranchId,
  );

  return canAccess ? nextBranchId : fallbackBranchId;
}

function getFingerprintHash(fingerprint) {
  return fingerprint?.hash || null;
}

class AuthService {
  static async signIn({ userName, password, fingerprint }) {
    const userData = await UserRepository.getUserData(userName);

    if (userData && (typeof userData.PASSWORD !== "string" || !userData.PASSWORD)) {
      throw new Unauthorized("Invalid login or password");
    }

    if (!userData) {
      throw new NotFound("Користувача не знайдено");
    }

    if (typeof userData.PASSWORD !== "string" || !userData.PASSWORD) {
      throw new Unauthorized("РќРµРїСЂР°РІРёР»СЊРЅРёР№ Р»РѕРіС–РЅ Р°Р±Рѕ РїР°СЂРѕР»СЊ");
    }

    const isPasswordValid = bcrypt.compareSync(password, userData.PASSWORD);

    if (!isPasswordValid) {
      throw new Unauthorized("Неправильний логін або пароль");
    }

    const payload = {
      id: userData.id,
      role: userData.role,
      userName: userData.NAME,
      city: userData.city,
      branchId: Number(userData.branch_id),
    };
    const accessToken = await TokenService.generateAccessToken(payload);
    const refreshToken = await TokenService.generateRefreshToken(payload);

    await RefreshSessionsRepository.createRefreshSession({
      id: userData.id,
      refreshToken,
      fingerprint,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
    };
  }

  static async signUp({
    currentUser,
    userName,
    user_name,
    password,
    role,
    city,
    branchId,
    supervisorId,
    branchAccessIds,
    cityAccessIds,
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      assertKnownRoleId(role);

      const hashedPassword = bcrypt.hashSync(password, 8);
      const user = await UserRepository.insertUser(connection, {
        userName,
        user_name,
        hashedPassword,
        role,
        city,
        branchId,
      });

      await applyUserAccessConfig(
        currentUser,
        {
          id: Number(user.id),
          role: Number(user.role),
          city: Number(user.city),
          branchId: Number(user.branch_id),
        },
        {
          branchAccessIds,
          cityAccessIds,
        },
        connection,
      );

      const normalizedSupervisorId =
        supervisorId === null || typeof supervisorId === "undefined" || supervisorId === ""
          ? null
          : Number(supervisorId);

      if (normalizedSupervisorId !== null) {
        if (!Number.isInteger(normalizedSupervisorId) || normalizedSupervisorId <= 0) {
          throw new BadRequest("supervisorId must be a positive integer");
        }

        if (!canRoleHaveSupervisor(role)) {
          throw new BadRequest("Supervisor can be assigned only for SV and TA roles");
        }

        const supervisor = await UserRepository.getActiveUserByIdInBranch(
          normalizedSupervisorId,
          Number(branchId),
        );

        if (!supervisor) {
          throw new NotFound("User or supervisor not found in current branch");
        }

        assertKnownRoleId(supervisor.role);
        assertSupervisorRoleForChildRole(Number(user.role), Number(supervisor.role));

        const result = await UserRepository.setParent(
          Number(user.id),
          normalizedSupervisorId,
          branchId,
          connection,
        );

        if (!result.affectedRows) {
          throw new NotFound("User or supervisor not found in current branch");
        }
      }

      await connection.commit();

      return { user };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async logOut(refreshToken) {
    await RefreshSessionsRepository.deleteRefreshSession(refreshToken);
  }

  static async refresh({ fingerprint, currentRefreshToken }) {
    if (!currentRefreshToken) {
      throw new Unauthorized();
    }

    const refreshSession = await RefreshSessionsRepository.getRefreshSession(
      currentRefreshToken
    );

    if (!refreshSession) {
      throw new Unauthorized();
    }

    const fingerprintHash = getFingerprintHash(fingerprint);

    if (!fingerprintHash || refreshSession.finger_print !== fingerprintHash) {
      throw new Forbidden();
    }

    await RefreshSessionsRepository.deleteRefreshSession(currentRefreshToken);

    let payload;
    try {
      payload = await TokenService.verifyRefreshToken(currentRefreshToken);
    } catch (error) {
      throw new Forbidden(error);
    }

    if (!payload || !payload.userName) {
      throw new Unauthorized();
    }

    const userData = await UserRepository.getUserData(payload.userName);

    if (!userData) {
      throw new Unauthorized();
    }

    const activeBranchId = await resolveActiveBranchId(userData, payload.branchId);
    const { id, role, NAME: userName, city } = userData; // Added city and user_name here
    const actualPayload = {
      id,
      userName,
      role,
      city,
      branchId: activeBranchId,
    }; // Added city and user_name here

    const accessToken = await TokenService.generateAccessToken(actualPayload);
    const refreshToken = await TokenService.generateRefreshToken(actualPayload);

    await RefreshSessionsRepository.createRefreshSession({
      id,
      refreshToken,
      fingerprint,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
    };
  }

  static async switchBranch({ currentUser, branchId, fingerprint }) {
    const userData = await UserRepository.getUserById(currentUser.id);

    if (!userData) {
      throw new Unauthorized();
    }

    const activeBranchId = await resolveActiveBranchId(userData, branchId);

    if (Number(activeBranchId) !== Number(branchId)) {
      throw new Forbidden("No access to requested branch");
    }

    const payload = {
      id: userData.id,
      role: userData.role,
      userName: userData.NAME,
      city: userData.city,
      branchId: activeBranchId,
    };

    const accessToken = await TokenService.generateAccessToken(payload);
    const refreshToken = await TokenService.generateRefreshToken(payload);

    await RefreshSessionsRepository.createRefreshSession({
      id: userData.id,
      refreshToken,
      fingerprint,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
    };
  }
}

export default AuthService;
