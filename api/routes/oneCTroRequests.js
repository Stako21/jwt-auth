import { Router } from "express";
import {
  listStatusPending,
  listTroRequests,
  markTroRequestCreated,
  rejectTroRequest,
  updateTroStage,
} from "../controllers/oneCTroRequestsController.js";
import { requireIntegrationCapability } from "../middlewares/oneCIntegrationAccount.js";

const router = Router();

const processRequests = requireIntegrationCapability("canProcessRequests");
const syncStatuses = requireIntegrationCapability("canSyncStatuses");

router.get("/tro-requests/status-pending", syncStatuses, listStatusPending);
router.get("/tro-requests", processRequests, listTroRequests);
router.post("/tro-requests/:id/created", processRequests, markTroRequestCreated);
router.post("/tro-requests/:id/rejected", processRequests, rejectTroRequest);
router.post("/tro-requests/:id/stage", syncStatuses, updateTroStage);

export default router;
