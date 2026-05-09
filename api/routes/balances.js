import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import { getBalanceFile } from "../controllers/balancesController.js";

const router = Router();

router.get("/:slug/file", authMiddleware, getBalanceFile);

export default router;
