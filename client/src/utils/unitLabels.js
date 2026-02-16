export const UNIT_LABELS = {
  PCS: "шт",
  KG: "кг",
  BOX: "ящ",
  BLOCK: "блок",
};

export const getUnitLabel = (unit) => {
  return UNIT_LABELS[unit] || unit;
};