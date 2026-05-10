export const ROLE_LABELS = {
  1: "Адміністратор",
  2: "Директор",
  3: "НТО",
  4: "SV",
  5: "TA",
  6: "Бухгалтер",
  7: "Склад",
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

export function roleName(id) {
  return ROLE_LABELS[id] || String(id);
}

export function hasRole(userRole, allowed) {
  if (Array.isArray(allowed)) return allowed.includes(userRole);
  return userRole === allowed;
}

export function ensureRole(allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!hasRole(req.user.role, allowed))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
