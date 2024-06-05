import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { Forbidden, Unauthorized } from "../utils/Errors.js";

dotenv.config();

class TokenService {
  static async generateAccessToken(payload) {
    return await jwt.sign(payload, process.env.ACCESSS_TOKEN_SECRET, {
      expiresIn: "30",
    });
  }

  static async generateRefreshToken(payload) {
    return await jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: "15d",
    });
  }

  static async checkAccess(req, _, next) {}
}

export default TokenService;
