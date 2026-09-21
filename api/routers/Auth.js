import { Router } from "express";
import AuthController from "../controllers/Auth.js";
import AuthValidator from "../validators/Auth.js";
import UserController from "../controllers/User.js";
import UserValidator from "../validators/User.js";
import * as DebugController from "../controllers/DebugController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import * as SchedulerController from "../controllers/SchedulerController.js";
import { denyRole, ensureRole, ROLE_IDS } from "../utils/roles.js";
import { denyOneCIntegrationAccount } from "../middlewares/oneCIntegrationAccount.js";

const router = Router();
const adminOnly = ensureRole([1]);

router.post("/sign-in", AuthValidator.signIn, AuthController.signIn);
router.post(
  "/sign-up",
  authMiddleware,
  denyOneCIntegrationAccount,
  adminOnly,
  AuthValidator.signUp,
  AuthController.signUp,
);
router.post("/logout", AuthValidator.logOut, AuthController.logOut);
router.post("/refresh", AuthValidator.refresh, AuthController.refresh);
router.use(authMiddleware, denyOneCIntegrationAccount);
router.get("/me", AuthController.me);
router.get(
  "/branches",
  authMiddleware,
  denyRole([ROLE_IDS.WarehouseDashboard]),
  AuthController.getBranches,
);
router.post(
  "/switch-branch",
  authMiddleware,
  ensureRole([1, 2]),
  AuthController.switchBranch,
);

router.get("/users", authMiddleware, adminOnly, UserController.getAllUsers);
router.get(
  "/assortments",
  authMiddleware,
  adminOnly,
  UserController.getAssortments,
);
router.get(
  "/sales_agents",
  authMiddleware,
  adminOnly,
  UserController.getSalesAgents,
);

router.get("/users/tree", authMiddleware, adminOnly, UserController.getUsersTree);
router.get(
  "/users/:id",
  authMiddleware,
  adminOnly,
  UserController.getUserDetail,
);
router.put(
  "/users/:id/supervisor",
  authMiddleware,
  adminOnly,
  UserValidator.setSupervisor,
  UserController.setSupervisor,
);
router.delete("/users/:id", authMiddleware, adminOnly, UserController.deleteUser);
router.put(
  "/users/:id/password",
  authMiddleware,
  adminOnly,
  UserValidator.changePassword,
  UserController.changePassword,
);
router.put(
  "/users/:id",
  authMiddleware,
  adminOnly,
  UserValidator.updateUser,
  UserController.updateUser,
);

router.get(
  "/debug/hierarchy/:userId",
  authMiddleware,
  adminOnly,
  DebugController.debugUserHierarchy,
);
router.get(
  "/debug/assortments",
  authMiddleware,
  adminOnly,
  UserController.getAssortmentDiagnostics,
);

router.get(
  "/scheduler/tasks",
  authMiddleware,
  adminOnly,
  SchedulerController.getTasks,
);
router.post(
  "/scheduler/run/:taskKey",
  authMiddleware,
  adminOnly,
  SchedulerController.runTask,
);
router.patch(
  "/scheduler/tasks/:taskKey",
  authMiddleware,
  adminOnly,
  SchedulerController.updateTask,
);

export default router;
