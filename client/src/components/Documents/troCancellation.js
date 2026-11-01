export function getTroCancellationWarning(document) {
  if ((document?.documentType || document?.document_type) !== "TRO") return null;
  const tro = document.tro;
  const stage = String(tro?.oneCStage || document.tro_one_c_stage || "").trim().toUpperCase();
  if (stage !== "CANCELLED") return null;

  const numbers = tro
    ? (tro.execution_documents || []).map((item) => item.document_number)
    : String(document.tro_execution_document_numbers || "").split("||");
  const executionNumbers = numbers.map((number) => String(number || "").trim()).filter(Boolean);
  if (!executionNumbers.length) return null;

  const parentNumber = tro?.upDocumentNumber || document.tro_up_document_number;
  const movement = tro?.movementType || document.tro_movement_type;
  const executionType = movement === "RETURN" ? "повернення" : "встановлення";
  const portalCancelled = document.status === "CANCELLED";
  return {
    title: "Скасування в УП не завершене",
    executionNumbers,
    message: `Батьківську заявку${parentNumber ? ` № ${parentNumber}` : ""} в УП скасовано або позначено на видалення. `
      + `Залишилися активні документи ${executionType}: ${executionNumbers.join(", ")}. `
      + (portalCancelled
        ? "На порталі заявку вже скасовано. Для узгодження даних перевірте документи виконання в УП. Синхронізація триває."
        : "Для остаточного скасування позначте ці документи на видалення в УП або відновіть батьківську заявку. Синхронізація триває."),
  };
}
