import { ReportDebet } from "./ReportDebet";
import { ReportBillOfLading } from "./ReportBillOfLading";
import { ReportOrdersByTime } from "./ReportOrdersByTime";
import { ReportRomashka } from "./ReportRomashka";
import { ReportXlsx1C } from "./ReportXlsx1C";
import { ReportXlsx1CSales } from "./ReportXlsx1CSales";

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

export function getReportComponent(report) {
  const entry = getStaticReportEntry(report?.reportKey);
  if (entry?.component) return entry.component;

  if (report?.reportType === "xlsx-1c") {
    return ReportXlsx1C;
  }

  if (report?.reportType === "xlsx-1c-sales") {
    return ReportXlsx1CSales;
  }

  return null;
}

export function canAccessStaticReport(report, role) {
  const reportKey = typeof report === "string" ? report : report?.reportKey;
  const entry = getStaticReportEntry(reportKey);

  if (
    !entry &&
    report?.reportType !== "xlsx-1c" &&
    report?.reportType !== "xlsx-1c-sales"
  ) {
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
