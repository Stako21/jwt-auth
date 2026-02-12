import { Router } from "express";
import * as RegionNotificationsController from "../controllers/RegionNotificationsController.js";
import { ensureRole } from "../utils/roles.js";

const router = Router();

// Only Admin and Director can manage region notifications
const adminOnly = ensureRole([1, 2]); // Admin: 1, Director: 2

router.get(
  "/",
  adminOnly,
  RegionNotificationsController.getRegionNotifications,
);
router.post(
  "/",
  adminOnly,
  RegionNotificationsController.createRegionNotification,
);
router.put(
  "/:id",
  adminOnly,
  RegionNotificationsController.updateRegionNotification,
);
router.delete(
  "/:id",
  adminOnly,
  RegionNotificationsController.deleteRegionNotification,
);

export default router;
