import troIntegration from "../services/TroIntegrationService.js";

function success(res, data) {
  return res.status(200).json({ ok: true, data });
}

function failure(res, error) {
  console.error("1C TRO integration error:", error);
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    ok: false,
    error: {
      code: error?.code || "INTERNAL_ERROR",
      message: status === 500 ? "Внутрішня помилка сервера" : error.message,
    },
  });
}

export async function listTroRequests(req, res) {
  try {
    return success(res, await troIntegration.listReady(req.user, req.query));
  } catch (error) {
    return failure(res, error);
  }
}

export async function markTroRequestCreated(req, res) {
  try {
    return success(res, await troIntegration.created(req.user, req.params.id, req.body || {}));
  } catch (error) {
    return failure(res, error);
  }
}

export async function rejectTroRequest(req, res) {
  try {
    return success(res, await troIntegration.rejected(req.user, req.params.id, req.body || {}));
  } catch (error) {
    return failure(res, error);
  }
}

export async function listStatusPending(req, res) {
  try {
    return success(res, await troIntegration.listPending(req.user, req.query));
  } catch (error) {
    return failure(res, error);
  }
}

export async function updateTroStage(req, res) {
  try {
    return success(res, await troIntegration.stage(req.user, req.params.id, req.body || {}));
  } catch (error) {
    return failure(res, error);
  }
}
