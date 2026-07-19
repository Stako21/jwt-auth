export const ROLE_LABELS = {
  1: "Адміністратор",
  2: "Директор",
  3: "НТО",
  4: "SV",
  5: "TA",
  6: "Бухгалтер",
  7: "Склад",
  8: "Комплектувальник (Picker)",
};

export const ROLE_IDS = {
  Admin: 1,
  Director: 2,
  NTO: 3,
  SV: 4,
  TA: 5,
  Accountant: 6,
  Warehouse: 7,
  Picker: 8,
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(
  ([value, label]) => ({
    value: Number(value),
    label,
  }),
);
