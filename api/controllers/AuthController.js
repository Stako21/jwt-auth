import AuthService from "../services/Auth.js";
import UserRepository from "../repositories/User.js";
import { catchError } from "../utils/Errors.js";

export const signUp = catchError(async (req, res, next) => {
  const { userName, password, fingerprint, role, city } = req.body;  // Added city here
  const userData = await UserRepository.getUserData(userName);

  if (userData) {
    return res.status(409).json({ error: "Користувач з таким ім'ям вже існує" });
  }

  const tokens = await AuthService.signUp({ userName, password, fingerprint, role, city }); // Added city here
  return res.json(tokens);
});
