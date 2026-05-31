import { ReportDebet } from "./ReportDebet";
import { ReportBillOfLading } from "./ReportBillOfLading";
import { ReportOrdersByTime } from "./ReportOrdersByTime";
import { ReportRomashka } from "./ReportRomashka";

export const STATIC_REPORT_REGISTRY = {
  "report-romashka": {
    component: ReportRomashka,
  },
  "report-debet": {
    component: ReportDebet,
  },
  "report-orders-by-time": {
    component: ReportOrdersByTime,
  },
  "report-bill-of-lading": {
    component: ReportBillOfLading,
  },
};

export function getStaticReportEntry(reportKey) {
  return STATIC_REPORT_REGISTRY[reportKey] || null;
}

export function canAccessStaticReport(report, role) {
  const reportKey = typeof report === "string" ? report : report?.reportKey;
  const entry = getStaticReportEntry(reportKey);

  if (!entry) {
    return false;
  }

  if (Number(role) === 1) {
    return true;
  }

  const allowedRoles = Array.isArray(report?.allowedRoles)
    ? report.allowedRoles.map(Number)
    : null;

  if (!allowedRoles) {
    return true;
  }

  return allowedRoles.includes(Number(role));
}
