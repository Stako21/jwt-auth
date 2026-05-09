import AuthService from "../services/Auth.js";
import ErrorsUtils, { Unprocessable } from "../utils/Errors.js";
import { COOKIE_SETTINGS } from "../constants.js";
import UserRepository from "../repositories/User.js";
import { BadRequest, Conflict, Forbidden } from "../utils/Errors.js";
import {
  canUserAccessBranch,
  getCityById,
  getUserBranchId,
  getVisibleBranchesForUser,
} from "../services/appConfig.service.js";

async function ensureCityInBranch(cityId, branchId) {
  const city = await getCityById(cityId);
  if (!city || Number(city.branchId) !== Number(branchId)) {
    throw new BadRequest("Selected city does not belong to current branch");
  }
}

class AuthController {
  static async signIn(req, res) {
    const { userName, password } = req.body;
    const { fingerprint } = req;
    try {
      const { accessToken, refreshToken, accessTokenExpiration } =
        await AuthService.signIn({ userName, password, fingerprint });

      res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);
      return res.status(200).json({ accessToken, accessTokenExpiration });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async signUp(req, res) {
    const {
      userName,
      user_name,
      password,
      role,
      city,
      supervisorId,
      branchAccessIds,
      cityAccessIds,
    } = req.body;
    const branchId = getUserBranchId(req.user);

    try {
      if (userName) {
        const existingByName = await UserRepository.getUserData(userName);
        if (existingByName) {
          throw new Conflict("Користувач з таким логіном вже існує");
        }
      }

      if (user_name) {
        const existingByUserName = await UserRepository.getUserByUserName(user_name);
        if (existingByUserName) {
          throw new Conflict("Користувач з таким user_name вже існує");
        }
      }

      await ensureCityInBranch(city, branchId);

      const { user } = await AuthService.signUp({
        currentUser: req.user,
        userName,
        user_name,
        password,
        role,
        city,
        supervisorId,
        branchId,
        branchAccessIds,
        cityAccessIds,
      });

      return res.status(201).json({
        user: {
          id: Number(user.id),
          role: Number(user.role),
          city: Number(user.city),
          branchId: Number(user.branch_id),
        },
      });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async logOut(req, res) {
    const refreshToken = req.cookies.refreshToken;
    try {
      await AuthService.logOut(refreshToken);
      res.clearCookie("refreshToken");
      return res.sendStatus(200);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async refresh(req, res) {
    const { fingerprint } = req;
    const currentRefreshToken = req.cookies.refreshToken;

    if (!currentRefreshToken) {
      return ErrorsUtils.catchError(
        res,
        new Unprocessable({
          path: "cookies.refreshToken",
          errors: ["Обов'язкове поле!"],
        }),
      );
    }

    try {
      const { accessToken, refreshToken, accessTokenExpiration } =
        await AuthService.refresh({
          currentRefreshToken,
          fingerprint,
        });

      res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);
      return res.status(200).json({ accessToken, accessTokenExpiration });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async me(req, res) {
    try {
      const userId = req.user.id;
      const user = await UserRepository.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const currentBranchId = Number(getUserBranchId(req.user));
      const availableBranches = await getVisibleBranchesForUser(req.user);
      const currentBranch =
        availableBranches.find(
          (branch) => Number(branch.id) === currentBranchId,
        ) || null;

      return res.status(200).json({
        id: user.id,
        login: user.NAME,
        displayName: user.user_name || user.NAME,
        role: user.role,
        city: user.city,
        branchId: currentBranchId,
        currentBranchId,
        currentBranch,
        availableBranches,
      });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getBranches(req, res) {
    try {
      const availableBranches = await getVisibleBranchesForUser(req.user);
      const currentBranchId = Number(getUserBranchId(req.user));
      res.status(200).json({
        currentBranchId,
        branches: availableBranches,
      });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async switchBranch(req, res) {
    const { branchId } = req.body;
    const { fingerprint } = req;
    const currentRefreshToken = req.cookies.refreshToken;

    try {
      if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) {
        throw new BadRequest("branchId is required");
      }

      const canAccess = await canUserAccessBranch(req.user, Number(branchId));
      if (!canAccess) {
        throw new Forbidden("Selected branch is not available for current user");
      }

      if (currentRefreshToken) {
        await AuthService.logOut(currentRefreshToken);
      }

      const { accessToken, refreshToken, accessTokenExpiration } =
        await AuthService.switchBranch({
          currentUser: req.user,
          branchId: Number(branchId),
          fingerprint,
        });

      res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);
      return res.status(200).json({ accessToken, accessTokenExpiration });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default AuthController;
