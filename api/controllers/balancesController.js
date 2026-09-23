import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import XLSX from "xlsx";
import {
  getBalancePageBySlug,
  getImportDir,
} from "../services/appConfig.service.js";
import { parseBalanceWorkbookData } from "../../client/src/utils/balanceWorkbookParser.js";
import { renderBalanceHtml } from "../pdf/balance.template.js";

function resolveBalanceFile(fileName) {
  const safeFileName = path.basename(fileName);
  return {
    safeFileName,
    filePath: path.resolve(getImportDir(), safeFileName),
  };
}

function formatFileTime(date) {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export async function getBalanceFile(req, res) {
  try {
    const { slug } = req.params;
    const page = await getBalancePageBySlug(req.user, slug);

    if (!page) {
      return res.status(404).json({ message: "Balance page not found" });
    }

    const { safeFileName, filePath } = resolveBalanceFile(page.fileName);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        message: "Файл залишків не знайдено",
        fileName: safeFileName,
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
    );

    return res.sendFile(filePath);
  } catch (error) {
    console.error("getBalanceFile error:", error);
    return res.status(500).json({ message: "Failed to load balance file" });
  }
}

export async function getBalancePdf(req, res) {
  let browser;

  try {
    const { slug } = req.params;
    const pageConfig = await getBalancePageBySlug(req.user, slug);
    if (!pageConfig) {
      return res.status(404).json({ message: "Сторінку залишків не знайдено" });
    }

    const { safeFileName, filePath } = resolveBalanceFile(pageConfig.fileName);
    let fileBuffer;
    let fileStat;
    try {
      [fileBuffer, fileStat] = await Promise.all([
        fs.readFile(filePath),
        fs.stat(filePath),
      ]);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return res.status(404).json({
          message: "Файл залишків не знайдено",
          fileName: safeFileName,
        });
      }
      throw error;
    }

    const parsed = parseBalanceWorkbookData(fileBuffer, {
      priceMultiplierPercent: pageConfig.priceMultiplierPercent,
      headerRow: pageConfig.headerRow,
      headerEndRow: pageConfig.headerEndRow,
      dataStartRow: pageConfig.dataStartRow,
      columnConfig: pageConfig.columnConfig,
    }, XLSX);
    const actualAt = parsed.lastUpdateTime || formatFileTime(fileStat.mtime);
    const html = renderBalanceHtml({
      warehouseName: pageConfig.headerTitle || pageConfig.menuTitle,
      actualAt,
      columns: parsed.columns,
      hierarchy: parsed.hierarchy,
    });

    browser = await puppeteer.launch({
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
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(html, { waitUntil: "networkidle0" });
    await pdfPage.emulateMediaType("print");
    const pdf = await pdfPage.pdf({
      format: "A4",
      landscape: (parsed.columns?.filter((column) => !column.isPrice).length || 2) > 3,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;font-size:8px;text-align:center;color:#555;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
      margin: { top: "16px", right: "16px", bottom: "24px", left: "16px" },
    });

    const fileName = `zalyshky-${slug}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    return res.end(pdf);
  } catch (error) {
    console.error("getBalancePdf error:", error);
    return res.status(500).json({ message: error.message || "Не вдалося створити PDF" });
  } finally {
    if (browser) await browser.close();
  }
}
