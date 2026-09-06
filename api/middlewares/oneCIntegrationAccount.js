function configuredLogins() {
  return new Set(
    String(process.env.ONE_C_INTEGRATION_LOGINS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOneCIntegrationAccount(user) {
  const login = String(user?.userName || "").trim().toLowerCase();
  return Boolean(login) && configuredLogins().has(login);
}

export function ensureOneCIntegrationAccount(req, res, next) {
  if (!isOneCIntegrationAccount(req.user)) {
    return res.status(403).json({
      ok: false,
      error: { code: "INTEGRATION_ACCESS_DENIED", message: "Доступ до API 1С заборонено" },
    });
  }
  return next();
}

export function denyOneCIntegrationAccount(req, res, next) {
  if (isOneCIntegrationAccount(req.user)) {
    return res.status(403).json({ error: "Integration account cannot use this endpoint" });
  }
  return next();
}
