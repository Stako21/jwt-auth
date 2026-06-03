import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
  createBalancePageController,
  createBranchController,
  createCityController,
  createReportController,
  getBalancePages,
  getBranchController,
  getBranchesController,
  getCities,
  getConfig,
  getImportSourcesController,
  getReports,
  getUserAccessController,
  getUserAccessOptionsController,
  setBranchActiveController,
  setImportSourceActiveController,
  setReportActiveController,
  setBalancePageActiveController,
  setCityActiveController,
  updateBranchByIdController,
  updateImportSourceController,
  updateBranchController,
  updateReportController,
  updateBalancePageController,
  updateCityController,
  updateUserAccessController,
} from "../controllers/configController.js";
import { ensureRole } from "../utils/roles.js";

const router = Router();
const adminOnly = ensureRole([1]);

router.get("/app", authMiddleware, getConfig);
router.get("/branches", authMiddleware, adminOnly, getBranchesController);
router.post("/branches", authMiddleware, adminOnly, createBranchController);
router.put("/branches/:id", authMiddleware, adminOnly, updateBranchByIdController);
router.patch(
  "/branches/:id/active",
  authMiddleware,
  adminOnly,
  setBranchActiveController,
);
router.get("/branch", authMiddleware, adminOnly, getBranchController);
router.put("/branch", authMiddleware, adminOnly, updateBranchController);
router.get("/cities", authMiddleware, adminOnly, getCities);
router.post("/cities", authMiddleware, adminOnly, createCityController);
router.put("/cities/:id", authMiddleware, adminOnly, updateCityController);
router.patch(
  "/cities/:id/active",
  authMiddleware,
  adminOnly,
  setCityActiveController,
);
router.get("/balance-pages", authMiddleware, adminOnly, getBalancePages);
router.post(
  "/balance-pages",
  authMiddleware,
  adminOnly,
  createBalancePageController,
);
router.put(
  "/balance-pages/:id",
  authMiddleware,
  adminOnly,
  updateBalancePageController,
);
router.patch(
  "/balance-pages/:id/active",
  authMiddleware,
  adminOnly,
  setBalancePageActiveController,
);
router.get("/reports", authMiddleware, adminOnly, getReports);
router.post("/reports", authMiddleware, adminOnly, createReportController);
router.put("/reports/:id", authMiddleware, adminOnly, updateReportController);
router.patch(
  "/reports/:id/active",
  authMiddleware,
  adminOnly,
  setReportActiveController,
);
router.get("/import-sources", authMiddleware, adminOnly, getImportSourcesController);
router.put(
  "/import-sources/:id",
  authMiddleware,
  adminOnly,
  updateImportSourceController,
);
router.patch(
  "/import-sources/:id/active",
  authMiddleware,
  adminOnly,
  setImportSourceActiveController,
);
router.get(
  "/user-access/options",
  authMiddleware,
  adminOnly,
  getUserAccessOptionsController,
);
router.get(
  "/users/:id/access",
  authMiddleware,
  adminOnly,
  getUserAccessController,
);
router.put(
  "/users/:id/access",
  authMiddleware,
  adminOnly,
  updateUserAccessController,
);

export default router;
