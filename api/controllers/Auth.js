import AuthService from "../services/Auth.js";
import ErrorsUtils, { Unprocessable } from "../utils/Errors.js";
import { COOKIE_SETTINGS } from "../constants.js";
import UserRepository from "../repositories/User.js";

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
    const { userName, password, role, city } = req.body;
    const { fingerprint } = req;
    try {
      const { accessToken, refreshToken, accessTokenExpiration } =
        await AuthService.signUp({
          userName,
          password,
          role,
          city,
          fingerprint,
        });

      // res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);

      return res.status(200).json({ accessToken, accessTokenExpiration });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async logOut(req, res) {
    const refreshToken = req.cookies.refreshToken;
    const { fingerprint } = req;
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
        })
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
    const userId = req.user.id; // ← из middleware

    const user = await UserRepository.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      id: user.id,
      login: user.NAME,
      displayName: user.user_name || user.NAME,
      role: user.role,
      city: user.city,
    });
  } catch (err) {
    return ErrorsUtils.catchError(res, err);
  }
}
}

export default AuthController;
