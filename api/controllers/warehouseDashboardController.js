import dashboardService from "../services/WarehouseDashboardService.js";
import ErrorsUtils from "../utils/Errors.js";
import { getUserBranchId } from "../services/appConfig.service.js";

export async function listDashboardAccounts(req, res) {
  try {
    return res.json(
      await dashboardService.listAccounts(getUserBranchId(req.user)),
    );
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function createDashboardAccount(req, res) {
  try {
    const data = await dashboardService.saveAccount(
      null,
      req.body || {},
      getUserBranchId(req.user),
    );
    return res.status(201).json(data);
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function updateDashboardAccount(req, res) {
  try {
    return res.json(
      await dashboardService.saveAccount(
        req.params.id,
        req.body || {},
        getUserBranchId(req.user),
      ),
    );
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}

export async function getWarehouseDashboard(req, res) {
  try {
    return res.json(
      await dashboardService.getDashboard({
        userId: Number(req.user.id),
        branchId: getUserBranchId(req.user),
        warehouseId: req.query.warehouseId,
      }),
    );
  } catch (error) {
    return ErrorsUtils.catchError(res, error);
  }
}
