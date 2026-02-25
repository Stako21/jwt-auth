import { Router } from "express";
import {
  createDocument,
  signDocument,
  prepareDocument,
  revisionDocument,
  rejectDocument,
  getDocuments,
  getDocumentById,
  retryDocumentNotificationsController,
  getDocumentHistory,
  updateDocument,
  getDocumentNotificationHistory,
} from "../controllers/documentsController.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { getDocumentPdf } from "../controllers/documentsController.js";
import { getDocumentNotifications } from "../controllers/documentsController.js";

const router = Router();

// Route to create a new document (protected)
router.post("/", authMiddleware, createDocument);
router.put("/:id", authMiddleware, updateDocument);
router.post("/:id/sign", authMiddleware, signDocument);
router.post("/:id/prepare", authMiddleware, prepareDocument);
router.post("/:id/revision", authMiddleware, revisionDocument);
router.post("/:id/reject", authMiddleware, rejectDocument);
router.post(
  "/:id/notifications/retry",
  authMiddleware,
  retryDocumentNotificationsController,
);

router.get("/", authMiddleware, getDocuments);
router.get("/:id/pdf", authMiddleware, getDocumentPdf);
router.get("/:id/history", authMiddleware, getDocumentHistory);
router.get("/:id/notifications", authMiddleware, getDocumentNotifications);
router.get(
  "/:id/notification-history",
  authMiddleware,
  getDocumentNotificationHistory,
);

router.get("/:id", authMiddleware, getDocumentById);
export default router;
