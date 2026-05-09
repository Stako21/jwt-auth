import ReportsRepository from "../repositories/Reports.js";
import ErrorsUtils from "../utils/Errors.js";
import puppeteer from "puppeteer";
import { renderSalesReportHtml } from "../pdf/salesReport.template.js";
import { getImportDir, getUserBranchId } from "../services/appConfig.service.js";
import fs from "fs/promises";
import path from "path";
import pool from "../db.cjs";

class ReportsController {
  static async getSalesReport(req, res) {
    try {
      const { id, role } = req.user;
      const branchId = getUserBranchId(req.user);
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "date is required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        reportDate: date,
        branchId,
      });

      const lastUpdate = await ReportsRepository.getLastImportDate({
        userId: id,
        role,
        branchId,
      });

      return res.json({
        meta: {
          date,
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
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "date is required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        reportDate: date,
        branchId,
      });

      const html = renderSalesReportHtml({
        date,
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
            Sales report ${date} - <span class="pageNumber"></span>/<span class="totalPages"></span>
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

      const fileName = `sales-report-${date}.pdf`;

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

      const [[report]] = await pool.query(
        `
        SELECT file_name
        FROM report_definitions
        WHERE branch_id = ?
          AND report_key = ?
          AND is_active = 1
        LIMIT 1
        `,
        [branchId, reportKey],
      );

      if (!report?.file_name) {
        return res.status(404).json({ message: "Report not found" });
      }

      const safeFileName = path.basename(report.file_name);
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

      return res.json(JSON.parse(raw.replace(/^\uFEFF/, "")));
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default ReportsController;
