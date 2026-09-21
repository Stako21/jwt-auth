import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { ensureRole } from "../utils/roles.js";
import { denyOneCIntegrationAccount } from "../middlewares/oneCIntegrationAccount.js";
import { createIntegrationAccount, listIntegrationAccounts, updateIntegrationAccount } from "../controllers/integrationAccountsController.js";

const router = Router();
router.use(authMiddleware, denyOneCIntegrationAccount, ensureRole([1]));
router.get("/", listIntegrationAccounts);
router.post("/", createIntegrationAccount);
router.put("/:id", updateIntegrationAccount);
export default router;
