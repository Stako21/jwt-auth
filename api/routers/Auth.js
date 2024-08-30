import { Router } from "express";
import AuthController from "../controllers/Auth.js";
import AuthValidator from "../validators/Auth.js";
import UserController from "../controllers/User.js";

const router = Router();

router.post("/sign-in", AuthValidator.signIn, AuthController.signIn);
router.post("/sign-up", AuthValidator.signUp, AuthController.signUp);
router.post("/logout", AuthValidator.logOut, AuthController.logOut);
router.post("/refresh", AuthValidator.refresh, AuthController.refresh);

// Новый маршрут для получения всех пользователей
router.get("/users", UserController.getAllUsers);  // Добавляем маршрут для получения всех пользователей
router.get("/adminPage");  // Добавляем маршрут для получения всех пользователей


export default router;
