export function getExecutionDocumentStatus(document) {
  if (document?.confirmed) {
    return { code: "CONFIRMED", label: "Підтверджено" };
  }
  if (document?.shipped_from_warehouse) {
    return { code: "SHIPPED", label: "Відвантажено зі складу" };
  }
  return { code: "NOT_CONFIRMED", label: "Не підтверджено" };
}

export function formatExecutionDocumentDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("uk-UA");
}
