import { Router } from "express";
import ReportsController from "../controllers/Reports.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/sales", authMiddleware, ReportsController.getSalesReport);

router.get("/date-range", authMiddleware, ReportsController.getReportDateRange);

export default router;
