import { Router } from "express";
import {
  listStatusPending,
  listTroRequests,
  markTroRequestCreated,
  rejectTroRequest,
  updateTroStage,
} from "../controllers/oneCTroRequestsController.js";

const router = Router();

router.get("/tro-requests/status-pending", listStatusPending);
router.get("/tro-requests", listTroRequests);
router.post("/tro-requests/:id/created", markTroRequestCreated);
router.post("/tro-requests/:id/rejected", rejectTroRequest);
router.post("/tro-requests/:id/stage", updateTroStage);

export default router;
