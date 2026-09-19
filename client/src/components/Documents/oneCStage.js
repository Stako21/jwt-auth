const ONE_C_STAGE_PRESENTATION = Object.freeze({
  NEW: Object.freeze({ label: "Новий", tone: "new", icon: "fa-circle" }),
  IN_PROGRESS: Object.freeze({ label: "Виконується", tone: "inProgress", icon: "fa-clock" }),
  COMPLETED: Object.freeze({ label: "Завершено", tone: "completed", icon: "fa-circle-check" }),
  CANCELLED: Object.freeze({ label: "Скасовано", tone: "cancelled", icon: "fa-circle-xmark" }),
});

const EMPTY_STAGE_PRESENTATION = Object.freeze({
  label: "—",
  tone: "empty",
  icon: "fa-minus",
});

export function getOneCStagePresentation(value) {
  const canonicalValue = typeof value === "string" ? value.trim().toUpperCase() : "";
  const presentation = ONE_C_STAGE_PRESENTATION[canonicalValue];

  return presentation
    ? { value: canonicalValue, ...presentation }
    : { value: null, ...EMPTY_STAGE_PRESENTATION };
}

export function getOneCStageLabel(value) {
  return getOneCStagePresentation(value).label;
}
