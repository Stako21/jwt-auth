import AuthService from "../services/Auth.js";
import UserRepository from "../repositories/User.js";
import { catchError } from "../utils/Errors.js";

export const signUp = catchError(async (req, res, next) => {
  const { userName, user_name, password, fingerprint, role, city } = req.body; // Added city and user_name

  // Check uniqueness for login name (name) if provided
  if (userName) {
    const existingByName = await UserRepository.getUserData(userName);
    if (existingByName) {
      return res
        .status(409)
        .json({ error: "Користувач з таким ім'ям вже існує" });
    }
  }

  // Check uniqueness for user_name (display name) if provided
  if (user_name) {
    const existingByUserName = await UserRepository.getUserByUserName(
      user_name
    );
    if (existingByUserName) {
      return res
        .status(409)
        .json({ error: "Користувач з таким user_name вже існує" });
    }
  }

  const tokens = await AuthService.signUp({
    userName,
    user_name,
    password,
    fingerprint,
    role,
    city,
  }); // Added user_name and city here
  return res.json(tokens);
});
