import ReportsRepository from "../repositories/Reports.js";
import ErrorsUtils from "../utils/Errors.js";
import puppeteer from "puppeteer";
import { renderSalesReportHtml } from "../pdf/salesReport.template.js";
import {
  canUserAccessReportDefinition,
  getActiveStaticReportDefinition,
  getImportDir,
  getUserBranchId,
} from "../services/appConfig.service.js";
import { getOrdersByTimeReport } from "../services/ordersByTimeReport.service.js";
import { getBillOfLadingReport } from "../services/billOfLadingReport.service.js";
import { getXlsx1cReport } from "../services/xlsx1cReport.service.js";
import { getXlsx1cSalesReport } from "../services/xlsx1cSalesReport.service.js";
import fs from "fs/promises";
import path from "path";

const ORDERS_BY_TIME_REPORT_KEY = "report-orders-by-time";
const BILL_OF_LADING_REPORT_KEY = "report-bill-of-lading";

function normalizeSalesReportRange(query) {
  const fallbackDate = query.date || query.dateFrom || query.dateTo;
  const dateFrom = query.dateFrom || fallbackDate;
  const dateTo = query.dateTo || fallbackDate;

  if (!dateFrom || !dateTo) {
    return null;
  }

  return {
    dateFrom,
    dateTo,
  };
}

class ReportsController {
  static async getSalesReport(req, res) {
    try {
      const { id, role } = req.user;
      const branchId = getUserBranchId(req.user);
      const range = normalizeSalesReportRange(req.query);

      if (!range) {
        return res.status(400).json({ message: "dateFrom and dateTo are required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        branchId,
      });

      const lastUpdate = await ReportsRepository.getLastImportDate({
        userId: id,
        role,
        branchId,
      });

      return res.json({
        meta: {
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          rows: rows.length,
          lastUpdate,
        },
        data: rows,
      });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getReportDateRange(req, res) {
    const range = await ReportsRepository.getReportDateRange({
      userId: req.user.id,
      role: req.user.role,
      branchId: getUserBranchId(req.user),
    });
    
    return res.json({ data: range });
  }

  static async getSalesReportPdf(req, res) {
    try {
      const { id, role } = req.user;
      const branchId = getUserBranchId(req.user);
      const range = normalizeSalesReportRange(req.query);

      if (!range) {
        return res.status(400).json({ message: "dateFrom and dateTo are required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        branchId,
      });

      const periodLabel =
        range.dateFrom === range.dateTo
          ? range.dateFrom
          : `${range.dateFrom} - ${range.dateTo}`;

      const html = renderSalesReportHtml({
        date: periodLabel,
        generatedAt: new Date(),
        rows,
      });

      const browser = await puppeteer.launch({
        headless: true,
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
        ],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      await page.emulateMediaType("print");

      const pdf = await page.pdf({
        format: "A4",
        landscape: false,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: `
          <div style="width:100%;font-size:10px;text-align:center;color:#555;">
            Sales report ${periodLabel} - <span class="pageNumber"></span>/<span class="totalPages"></span>
          </div>
        `,
        margin: {
          top: "20px",
          right: "20px",
          bottom: "20px",
          left: "20px",
        },
      });

      await browser.close();

      const fileName = `sales-report-${periodLabel}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", pdf.length);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );

      return res.end(pdf);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getStaticReport(req, res) {
    try {
      const branchId = getUserBranchId(req.user);
      const { reportKey } = req.params;

      const report = await getActiveStaticReportDefinition(branchId, reportKey);

      if (!report?.fileName) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (!canUserAccessReportDefinition(req.user, report)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (report.reportType === "xlsx-1c") {
        const parsedReport = await getXlsx1cReport(report);
        return res.json(parsedReport);
      }

      if (report.reportType === "xlsx-1c-sales") {
        const parsedReport = await getXlsx1cSalesReport({
          branchId,
          report,
          dateFrom: req.query.dateFrom,
          dateTo: req.query.dateTo,
        });
        return res.json(parsedReport);
      }

      if (reportKey === ORDERS_BY_TIME_REPORT_KEY) {
        const rows = await getOrdersByTimeReport({
          branchId,
          fileName: report.fileName,
        });

        return res.json(rows);
      }

      if (reportKey === BILL_OF_LADING_REPORT_KEY) {
        const rows = await getBillOfLadingReport({
          branchId,
          fileName: report.fileName,
        });

        return res.json(rows);
      }

      const safeFileName = path.basename(report.fileName);
      const filePath = path.resolve(getImportDir(), safeFileName);

      let raw;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        return res.status(404).json({
          message: "Файл звіту не знайдено",
          fileName: safeFileName,
        });
      }

      const parsedReport = JSON.parse(raw.replace(/^\uFEFF/, ""));

      return res.json(parsedReport);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default ReportsController;
