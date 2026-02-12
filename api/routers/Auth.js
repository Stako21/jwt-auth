import { Router } from "express";
import AuthController from "../controllers/Auth.js";
import AuthValidator from "../validators/Auth.js";
import UserController from "../controllers/User.js";
import * as DebugController from "../controllers/DebugController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import reportRoutes from "../routes/reports.js";
import documentsRoutes from "../routes/documents.js";
import directoriesRoutes from "../routes/directoryes.js";
import regionNotificationsRoutes from "../routes/regionNotifications.js";

const router = Router();

router.post("/sign-in", AuthValidator.signIn, AuthController.signIn);
router.post("/sign-up", AuthValidator.signUp, AuthController.signUp);
router.post("/logout", AuthValidator.logOut, AuthController.logOut);
router.post("/refresh", AuthValidator.refresh, AuthController.refresh);
router.get("/me", authMiddleware, AuthController.me);

// Новый маршрут для получения всех пользователей
router.get("/users", UserController.getAllUsers); // Добавляем маршрут для получения всех пользователей
router.get("/sales_agents", UserController.getSalesAgents); // Добавляем маршрут для получения всех пользователей
router.get("/adminPage"); // Добавляем маршрут для получения всех пользователей

router.get("/users/tree", UserController.getUsersTree);
router.put("/users/:id/supervisor", UserController.setSupervisor);

// Маршрут для удаления пользователя
router.delete("/users/:id", UserController.deleteUser); // Указание метода deleteUser
router.put("/users/:id/password", UserController.changePassword);
router.put("/users/:id", UserController.updateUser);

// Debug endpoint
router.get(
  "/debug/hierarchy/:userId",
  authMiddleware,
  DebugController.debugUserHierarchy,
);

router.use("/reports", reportRoutes);
router.use("/documents", authMiddleware, documentsRoutes);

router.use("/directories", authMiddleware, directoriesRoutes);
router.use("/region-notifications", authMiddleware, regionNotificationsRoutes);
export default router;
