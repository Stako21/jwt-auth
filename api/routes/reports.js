import { Router } from "express";
import ReportsController from "../controllers/Reports.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

router.get(
  "/sales",
  authMiddleware,
  ReportsController.getSalesReport
);

export default router;