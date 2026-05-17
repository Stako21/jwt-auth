import { ROLE_IDS } from "../../utils/roles";
import { ReportDebet } from "./ReportDebet";
import { ReportRomashka } from "./ReportRomashka";

export const STATIC_REPORT_REGISTRY = {
  "report-romashka": {
    component: ReportRomashka,
    allowedRoles: [ROLE_IDS.Admin, ROLE_IDS.Director],
  },
  "report-debet": {
    component: ReportDebet,
    allowedRoles: null,
  },
};

export function getStaticReportEntry(reportKey) {
  return STATIC_REPORT_REGISTRY[reportKey] || null;
}

export function canAccessStaticReport(reportKey, role) {
  const entry = getStaticReportEntry(reportKey);

  if (!entry) {
    return false;
  }

  if (!entry.allowedRoles) {
    return true;
  }

  return entry.allowedRoles.includes(Number(role));
}
