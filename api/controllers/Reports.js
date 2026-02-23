import ReportsRepository from "../repositories/Reports.js";
import ErrorsUtils from "../utils/Errors.js";
import puppeteer from "puppeteer";
import { renderSalesReportHtml } from "../pdf/salesReport.template.js";

class ReportsController {
  static async getSalesReport(req, res) {
    try {
      const { id, role } = req.user;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "date is required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        reportDate: date,
      });

      const lastUpdate = await ReportsRepository.getLastImportDate();

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
    const range = await ReportsRepository.getReportDateRange();
    
    return res.json({ data: range });
  }

  static async getSalesReportPdf(req, res) {
    try {
      const { id, role } = req.user;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "date is required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        reportDate: date,
      });

      const html = renderSalesReportHtml({
        date,
        generatedAt: new Date(),
        rows,
      });

      const browser = await puppeteer.launch({
        headless: true,
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
}

export default ReportsController;
