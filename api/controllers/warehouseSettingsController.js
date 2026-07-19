import ErrorsUtils from "../utils/Errors.js";
import { getUserBranchId } from "../services/appConfig.service.js";
import {
  getWarehouses,
  previewWarehouseRateChange,
  saveWarehouseRate,
} from "../services/warehouseSettings.service.js";

export async function listWarehouses(req, res) {
  try {
    const warehouses = await getWarehouses(getUserBranchId(req.user));
    return res.json({ warehouses });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function previewRate(req, res) {
  try {
    const impact = await previewWarehouseRateChange({
      branchId: getUserBranchId(req.user),
      warehouseId: Number(req.params.id),
      ...req.body,
    });
    return res.json({ impact });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function saveRate(req, res) {
  try {
    const result = await saveWarehouseRate({
      branchId: getUserBranchId(req.user),
      warehouseId: Number(req.params.id),
      userId: Number(req.user.id),
      ...req.body,
    });

    if (!result.saved && result.confirmationRequired) {
      return res.status(409).json({
        error:
          "Увага! Зміна ставки впливає на вже розрахований період.",
        confirmationRequired: true,
        impact: result.impact,
      });
    }

    const warehouses = await getWarehouses(getUserBranchId(req.user));
    return res.json({ result, warehouses });
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}
