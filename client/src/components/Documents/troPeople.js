export function getTroPeople({
  executorName,
  oneCSalesAgentName,
  requestSalesAgentName,
} = {}) {
  const responsible = String(executorName || "").trim();
  const oneCSalesAgent = String(oneCSalesAgentName || "").trim();
  const requestSalesAgent = String(requestSalesAgentName || "").trim();

  return {
    executorName: responsible || "—",
    salesAgentName: oneCSalesAgent || requestSalesAgent || "—",
    isRequestSalesAgent: !oneCSalesAgent && Boolean(requestSalesAgent),
  };
}
