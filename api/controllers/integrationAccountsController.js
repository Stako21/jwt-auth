import integrationAccounts from "../services/IntegrationAccountsService.js";

function failure(res, error) {
  const status = Number(error?.status) || 500;
  if (status === 500) console.error("Integration accounts error:", error);
  return res.status(status).json({ ok: false, error: { code: error?.code || "INTERNAL_ERROR", message: status === 500 ? "Внутрішня помилка сервера" : error.message } });
}

export async function signInIntegrationAccount(req, res) {
  try { return res.status(200).json({ ok: true, data: await integrationAccounts.signIn(req.body || {}) }); }
  catch (error) { return failure(res, error); }
}
export async function listIntegrationAccounts(_req, res) {
  try { return res.status(200).json({ ok: true, data: await integrationAccounts.list() }); }
  catch (error) { return failure(res, error); }
}
export async function createIntegrationAccount(req, res) {
  try { return res.status(201).json({ ok: true, data: await integrationAccounts.save(null, req.body || {}, req.user.id || req.user.userID) }); }
  catch (error) { return failure(res, error); }
}
export async function updateIntegrationAccount(req, res) {
  try { return res.status(200).json({ ok: true, data: await integrationAccounts.save(req.params.id, req.body || {}, req.user.id || req.user.userID) }); }
  catch (error) { return failure(res, error); }
}
