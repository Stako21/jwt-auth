import { Router } from "express";
import ReportsController from "../controllers/Reports.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { denyRole, ROLE_IDS } from "../utils/roles.js";

const router = Router();
const pickerRestricted = denyRole([ROLE_IDS.Picker]);

router.get("/sales", authMiddleware, pickerRestricted, ReportsController.getSalesReport);
router.get(
  "/sales/pdf",
  authMiddleware,
  pickerRestricted,
  ReportsController.getSalesReportPdf,
);
router.get("/static/:reportKey", authMiddleware, ReportsController.getStaticReport);

router.get(
  "/date-range",
  authMiddleware,
  pickerRestricted,
  ReportsController.getReportDateRange,
);

export default router;
