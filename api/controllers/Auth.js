import AuthService from "../services/Auth.js";
import ErrorsUtils, { Unprocessable } from "../utils/Errors.js";
import { COOKIE_SETTINGS } from "../constants.js";

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
      console.log('+++++++++++++++++err+++++++++++++++');
      console.log(err);
      console.log('+++++++++++++++++err+++++++++++++++');

      return ErrorsUtils.catchError(res, err);
    }
  }

  // static async signUp(req, res) {
  //   const { userName, password, role } = req.body;
  //   const { fingerprint } = req;
  //   try {
  //     const { accessToken, refreshToken, accessTokenExpiration } =
  //       await AuthService.signUp({ userName, password, role, fingerprint });

  //     res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);

  //     return res.status(200).json({ accessToken, accessTokenExpiration });
  //   } catch (err) {
  //     console.log('+++++++++++++++++err+++++++++++++++');
  //     console.log(err);
  //     console.log('+++++++++++++++++err+++++++++++++++');

  //     return ErrorsUtils.catchError(res, err);
  //   }
  // }

  static async signUp(req, res) {
    const { userName, password, role, city } = req.body;
    const { fingerprint } = req;
    try {
      const { accessToken, refreshToken, accessTokenExpiration } =
        await AuthService.signUp({ userName, password, role, city, fingerprint });

      res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);

      return res.status(200).json({ accessToken, accessTokenExpiration });
    } catch (err) {
      console.log('+++++++++++++++++err+++++++++++++++');
      console.log(err);
      console.log('+++++++++++++++++err+++++++++++++++');

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

    console.log('@@@@@@@@@@req.cookies@@@@@@@@@@@', req.cookies);

    const { fingerprint } = req;
    const currentRefreshToken = req.cookies.refreshToken;
  
    console.log('currentRefreshToken:', currentRefreshToken); // Логування токену
  
    if (!currentRefreshToken) {
      return ErrorsUtils.catchError(res, new Unprocessable({
        path: "cookies.refreshToken",
        errors: ["Поле обязательно!"],
      }));
    }
  
    try {
      const { accessToken, refreshToken, accessTokenExpiration } =
        await AuthService.refresh({
          currentRefreshToken,
          fingerprint,
        });
  
      res.cookie("refreshToken", refreshToken, COOKIE_SETTINGS.REFRESH_TOKEN);

      console.log('Refresh: refreshToken set in cookie:', refreshToken);
  
      return res.status(200).json({ accessToken, accessTokenExpiration });
    } catch (err) {
      console.log("err", err);
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default AuthController;
