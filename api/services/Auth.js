import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import TokenService from "./Token.js";
import { Conflict, Forbidden, NotFound, Unauthorized } from "../utils/Errors.js";
import RefreshSessionsRepository from "../repositories/RefreshSession.js";
import UserRepository from "../repositories/User.js";
import { ACCESS_TOKEN_EXPIRATION } from "../constants.js";

class AuthService {
  static async signIn({ userName, password, fingerprint }) {
    // Получаем данные пользователя по userName
    const userData = await UserRepository.getUserData(userName);

    if (!userData) {
      throw new NotFound("Користувача не знайдено");
    }

    // Проверяем, совпадает ли введенный пароль с хранимым паролем
    const isPasswordValid = bcrypt.compareSync(password, userData.PASSWORD);

    console.log("$$$$$$$$$$$$$$$$$$$$$$$isPasswordValid");
    console.log(isPasswordValid);

    if (!isPasswordValid) {
      throw new Unauthorized("Неправильний логін або пароль");
    }

    // Формируем payload с использованием userData.NAME
    const payload = { id: userData.id, role: userData.role, userName: userData.NAME };

    const accessToken = await TokenService.generateAccessToken(payload);
    const refreshToken = await TokenService.generateRefreshToken(payload);

    // Создаем новую сессию обновления для пользователя
    await RefreshSessionsRepository.createRefreshSession({
      id: userData.id,
      refreshToken,
      fingerprint,
    });

    console.log('Refresh session inserted:', {
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

  static async signUp({ userName, password, fingerprint, role }) {
    // Проверяем, существует ли уже пользователь с таким userName
    const userData = await UserRepository.getUserData(userName);
    if (userData) {
      throw new Conflict("Користувач з таким ім'ям вже існує");
    }

    // Хешируем пароль и создаем нового пользователя
    const hashedPassword = bcrypt.hashSync(password, 8);
    const user = await UserRepository.createUser({ userName, hashedPassword, role });

    // Формируем payload для нового пользователя
    const payload = { id: user.id, userName, role };
    const accessToken = await TokenService.generateAccessToken(payload);
    const refreshToken = await TokenService.generateRefreshToken(payload);

    // Создаем новую сессию обновления для пользователя
    await RefreshSessionsRepository.createRefreshSession({
      id: user.id,
      refreshToken,
      fingerprint,
    });

    console.log('Refresh session inserted:', {
      id: user.id,
      refreshToken,
      fingerprint,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
    };
  }

  static async logOut(refreshToken) {
    // Удаляем сессию обновления по refreshToken
    await RefreshSessionsRepository.deleteRefreshSession(refreshToken);
    console.log('Log out, refreshToken deleted:', refreshToken);
  }

  static async refresh({ fingerprint, currentRefreshToken }) {
    if (!currentRefreshToken) {
      console.log("!currentRefreshToken");
      throw new Unauthorized();
    }
  
    // Получаем сессию обновления по refreshToken
    const refreshSession = await RefreshSessionsRepository.getRefreshSession(currentRefreshToken);
  
    if (!refreshSession) {
      console.log("!refreshSession");
      throw new Unauthorized();
    }
  
    console.log("refreshSession.finger_print");
    console.log(refreshSession.finger_print);
    console.log("fingerprint.hash");
    console.log(fingerprint.hash);
    if (refreshSession.finger_print !== fingerprint.hash) {
      console.log("refreshSession.finger_print !== fingerprint.hash");
      throw new Forbidden();
    }
  
    // Удаляем старую сессию обновления
    await RefreshSessionsRepository.deleteRefreshSession(currentRefreshToken);
    console.log('Old refresh session deleted:', currentRefreshToken);
  
    let payload;
    try {
      // Проверяем и декодируем refreshToken
      payload = await TokenService.verifyRefreshToken(currentRefreshToken);
    } catch (error) {
      throw new Forbidden(error);
    }

    console.log('&&&&&&&&&&&&&&&&&&&&&&&&&payload', payload);
    console.log('&&&&&&&&&&&&&&&&&&&&&&&&&payload.userName', payload.userName);
  
    if (!payload || !payload.userName) {
      console.log(!payload || !payload.userName);
      console.log("Invalid payload or userName not found in payload");
      throw new Unauthorized();
    }
  
    // Получаем данные пользователя по userName из payload
    const userData = await UserRepository.getUserData(payload.userName);
  
    if (!userData) {
      console.log("User not found with userName:", payload.userName);
      throw new Unauthorized();
    }
  
    // Формируем новый payload для обновленного accessToken
    const { id, role, NAME: userName } = userData;
    const actualPayload = { id, userName, role };

    console.log('**********************actualPayload*****************', actualPayload);

    const accessToken = await TokenService.generateAccessToken(actualPayload);
    const refreshToken = await TokenService.generateRefreshToken(actualPayload);
  
    // Создаем новую сессию обновления для пользователя
    await RefreshSessionsRepository.createRefreshSession({
      id,
      refreshToken,
      fingerprint,
    });

    console.log('Refresh session inserted:', {
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
}

export default AuthService;


// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import TokenService from "./Token.js";
// import { Conflict, Forbidden, NotFound, Unauthorized } from "../utils/Errors.js";
// import RefreshSessionsRepository from "../repositories/RefreshSession.js";
// import UserRepository from "../repositories/User.js";
// import { ACCESS_TOKEN_EXPIRATION } from "../constants.js";

// class AuthService {
//   static async signIn({ userName, password, fingerprint }) {
//     const userData = await UserRepository.getUserData(userName);

//     if (!userData) {
//       throw new NotFound("Користувача не знайдено");
//     }

//     const isPasswordValid = bcrypt.compareSync(password, userData.PASSWORD)

//     console.log("$$$$$$$$$$$$$$$$$$$$$$$isPasswordValid");
//     console.log(isPasswordValid);

//     if (!isPasswordValid) {
//       throw new Unauthorized("Неправильний логін або пароль");
//     }

//     const payload = { id: userData.id, role: userData.role, userName: userData.NAME };

//     const accessToken = await TokenService.generateAccessToken(payload);
//     const refreshToken = await TokenService.generateRefreshToken(payload);

//     await RefreshSessionsRepository.createRefreshSession({
//       id: userData.id,
//       refreshToken,
//       fingerprint,
//     });

//     return {
//       accessToken,
//       refreshToken,
//       accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
//     };
//   }

//   static async signUp({ userName, password, fingerprint, role }) {
//     const userData = await UserRepository.getUserData(userName);
//     if (userData) {
//       throw new Conflict("Користувач з таким ім'ям вже існує");
//     }

//     const hashedPassword = bcrypt.hashSync(password, 8);
//     const user = await UserRepository.createUser({ userName, hashedPassword, role });

//     const payload = { id: user.id, userName: userData.NAME, role };
//     const accessToken = await TokenService.generateAccessToken(payload);
//     const refreshToken = await TokenService.generateRefreshToken(payload);

//     await RefreshSessionsRepository.createRefreshSession({
//       id: user.id,
//       refreshToken,
//       fingerprint,
//     });

//     return {
//       accessToken,
//       refreshToken,
//       accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
//     };
//   }

//   static async logOut(refreshToken) {
//     await RefreshSessionsRepository.deleteRefreshSession(refreshToken);
//   }

//   static async refresh({ fingerprint, currentRefreshToken }) {
//     if (!currentRefreshToken) {
//       console.log("!currentRefreshToken");
//       throw new Unauthorized();
//     }
  
//     const refreshSession = await RefreshSessionsRepository.getRefreshSession(currentRefreshToken);
  
//     if (!refreshSession) {
//       console.log("!refreshSession");
//       throw new Unauthorized();
//     }
  
//     console.log("refreshSession.finger_print");
//     console.log(refreshSession.finger_print);
//     console.log("fingerprint.hash");
//     console.log(fingerprint.hash);
//     if (refreshSession.finger_print !== fingerprint.hash) {
//       console.log("refreshSession.finger_print !== fingerprint.hash");
//       throw new Forbidden();
//     }
  
//     await RefreshSessionsRepository.deleteRefreshSession(currentRefreshToken);
  
//     let payload;
//     try {
//       payload = await TokenService.verifyRefreshToken(currentRefreshToken);
//     } catch (error) {
//       throw new Forbidden(error);
//     }

//     console.log('&&&&&&&&&&&&&&&&&&&&&&&&&payload', payload);
//     console.log('&&&&&&&&&&&&&&&&&&&&&&&&&payload.userName', payload.userName);
  
//     if (!payload || !payload.userName) {
//       console.log(!payload || !payload.userName);
//       console.log("Invalid payload or userName not found in payload");
//       throw new Unauthorized();
//     }
  
//     const userData = await UserRepository.getUserData(payload.userName);
  
//     if (!userData) {
//       console.log("User not found with userName:", payload.userName);
//       throw new Unauthorized();
//     }
  
//     const { id, role, name: userName } = userData;
  
//     const actualPayload = { id, userName, role };
    
//     console.log('**********************actualPayload*****************', actualPayload);

//     const actualPayload1 = { id, userName: userData.NAME , role };
//     console.log('**********************actualPayload1*****************', actualPayload1);
    
//     const accessToken = await TokenService.generateAccessToken(actualPayload);
//     const refreshToken = await TokenService.generateRefreshToken(actualPayload);
  
//     await RefreshSessionsRepository.createRefreshSession({
//       id,
//       refreshToken,
//       fingerprint,
//     });
  
//     return {
//       accessToken,
//       refreshToken,
//       accessTokenExpiration: ACCESS_TOKEN_EXPIRATION,
//     };
//   }
  
  
// }

// export default AuthService;
