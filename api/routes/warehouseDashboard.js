import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { ensureRole, ROLE_IDS } from "../utils/roles.js";
import {
  createDashboardAccount,
  getWarehouseDashboard,
  listDashboardAccounts,
  updateDashboardAccount,
} from "../controllers/warehouseDashboardController.js";

const router = Router();
router.use(authMiddleware);
router.get("/", ensureRole([ROLE_IDS.WarehouseDashboard]), getWarehouseDashboard);
router.get("/accounts", ensureRole([ROLE_IDS.Admin]), listDashboardAccounts);
router.post("/accounts", ensureRole([ROLE_IDS.Admin]), createDashboardAccount);
router.put("/accounts/:id", ensureRole([ROLE_IDS.Admin]), updateDashboardAccount);

export default router;
