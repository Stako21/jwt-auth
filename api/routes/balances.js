import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { getBalanceFile, getBalancePdf } from "../controllers/balancesController.js";

const router = Router();

router.get("/:slug/file", authMiddleware, getBalanceFile);
router.get("/:slug/pdf", authMiddleware, getBalancePdf);

export default router;
