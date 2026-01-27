export const ROLE_LABELS = {
  1: "Admin",
  2: "Director",
  3: "NTO",
  4: "SV",
  5: "TA",
  6: "Accountant",
  7: "Warehouse",
};

export const ROLE_IDS = {
  Admin: 1,
  Director: 2,
  NTO: 3,
  SV: 4,
  TA: 5,
  Accountant: 6,
  Warehouse: 7,
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(
  ([value, label]) => ({
    value: Number(value),
    label,
  }),
);
