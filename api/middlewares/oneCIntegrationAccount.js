import jwt from "jsonwebtoken";
import IntegrationAccountsRepository from "../repositories/IntegrationAccounts.js";

export function isOneCIntegrationAccount(user) {
  return user?.principalType === "integration";
}

export async function integrationAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Потрібен access token" } });
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!isOneCIntegrationAccount(decoded) || !Number.isInteger(Number(decoded.integrationAccountId))) throw new Error("Invalid integration token");
    const account = await IntegrationAccountsRepository.findActiveWithScope(Number(decoded.integrationAccountId));
    if (!account) return res.status(403).json({ ok: false, error: { code: "INTEGRATION_ACCOUNT_DISABLED", message: "Технічний обліковий запис неактивний" } });
    const cityIds = [...new Set(account.cities.map((city) => Number(city.city_id)))];
    const branchIds = [...new Set(account.cities.map((city) => Number(city.branch_id)))];
    if (!cityIds.length) return res.status(403).json({ ok: false, error: { code: "INTEGRATION_SCOPE_EMPTY", message: "Для облікового запису не налаштовано міста" } });
    req.user = {
      principalType: "integration",
      integrationAccountId: Number(account.id),
      userName: account.login,
      displayName: account.display_name,
      canProcessRequests: Boolean(account.can_process_requests),
      canSyncStatuses: Boolean(account.can_sync_statuses),
      cityIds,
      branchIds,
    };
    IntegrationAccountsRepository.touchUsed(account.id).catch((error) => console.error("Unable to update integration account activity:", error));
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Недійсний або прострочений access token" } });
  }
}

export function ensureOneCIntegrationAccount(req, res, next) {
  if (!isOneCIntegrationAccount(req.user)) return res.status(403).json({ ok: false, error: { code: "INTEGRATION_ACCESS_DENIED", message: "Доступ до API 1С заборонено" } });
  return next();
}

export function denyOneCIntegrationAccount(req, res, next) {
  if (isOneCIntegrationAccount(req.user)) return res.status(403).json({ error: "Integration account cannot use this endpoint" });
  return next();
}

export function requireIntegrationCapability(capability) {
  return (req, res, next) => {
    if (!isOneCIntegrationAccount(req.user) || !req.user?.[capability]) {
      return res.status(403).json({ ok: false, error: { code: "INTEGRATION_CAPABILITY_DENIED", message: "Для облікового запису не надано потрібне право інтеграції" } });
    }
    return next();
  };
}
