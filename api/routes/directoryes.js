import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
  getContractors,
  getProductGroups,
  getProducts,
  getTradePoints,
  getTroProducts,
} from "../controllers/directoriesController.js";

const router = Router();

router.get("/products", authMiddleware, getProducts);
router.get("/trade-points", authMiddleware, getTradePoints);
router.get("/tro-products", authMiddleware, getTroProducts);

router.get("/contractors", authMiddleware, getContractors);
router.get("/product-groups", authMiddleware, getProductGroups);

export default router;
