import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { renderDocumentHtml } from "../pdf/documentTemplate.js";
import { renderReturnHtml } from "../pdf/return.template.js";
import { renderExchangeHtml } from "../pdf/exchange.template.js";
import { getDocumentsService } from "../services/DocumentService.js";
import {
  createDocumentService,
  signDocumentService,
  revisionDocumentService,
  rejectDocumentService,
  getDocumentByIdService,
} from "../services/DocumentService.js";
import UserRepository from "../repositories/User.js";

import puppeteer from "puppeteer";
import { getDocumentNotificationsService } from "../services/notification.service.js";
import { retryDocumentNotifications } from "../services/notificationRetry.service.js";

// Controller to handle document creation
export async function createDocument(req, res) {
  try {
    const user = req.user; // из JWT
    const payload = req.body;

    const result = await createDocumentService(user, payload);

    res.status(201).json(result);
  } catch (err) {
    console.error("createDocument error:", err);
    res.status(400).json({
      message: err.message || "Ошибка создания документа",
    });
  }
}

export async function signDocument(req, res) {
  try {
    const result = await signDocumentService(
      req.user,
      req.params.id,
      req.body?.comment,
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function revisionDocument(req, res) {
  try {
    const result = await revisionDocumentService(
      req.user,
      req.params.id,
      req.body?.comment,
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function rejectDocument(req, res) {
  try {
    const result = await rejectDocumentService(
      req.user,
      req.params.id,
      req.body?.comment,
    );
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function getDocuments(req, res) {
  try {
    const result = await getDocumentsService(req.user, req.query);
    res.json(result);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
}

export async function getDocumentById(req, res) {
  try {
    const result = await getDocumentByIdService(req.user, req.params.id);
    res.json(result);
  } catch (e) {
    if (e.message === "FORBIDDEN") {
      return res.status(403).json({ message: "Нет доступа к документу" });
    }
    if (e.message === "NOT_FOUND") {
      return res.status(404).json({ message: "Документ не найден" });
    }
    res.status(400).json({ message: e.message });
  }
}

export async function getDocumentPdf(req, res) {
  try {
    const doc = await getDocumentByIdService(req.user, req.params.id);

    console.log("Document:", doc);

    if (doc.signedBy) {
      const signer = await UserRepository.getUserById(doc.signedBy);

      doc.signerName = signer ? signer.user_name : "";
    }

    const stampBase64 = await loadStampBase64(doc.status);

    console.log("Rendering HTML for doc:", doc.documentNumber);
    const html =
      doc.documentType === "RETURN"
        ? renderReturnHtml(doc, stampBase64)
        : renderExchangeHtml(doc, stampBase64);

    console.log("HTML length:", html.length);

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

    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err));

    await page.setContent(html, {
      waitUntil: "networkidle0",
      baseURL: `file://${process.cwd()}/api/pdf/`,
    });

    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,

      headerTemplate: `<div></div>`,

      footerTemplate: `
        <div style="
          width: 100%;
          font-size: 10px;
          text-align: center;
          color: #555;
          padding: 0 20px;
        ">
          ${doc.documentNumber} — 
          <span class="pageNumber"></span> /
          <span class="totalPages"></span>
        </div>
      `,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },
    });

    console.log("PDF generated, size:", pdf.length, "type:", typeof pdf);
    console.log("PDF first 50 bytes (hex):", pdf.slice(0, 50).toString("hex"));
    console.log(
      "PDF starts with %PDF?:",
      pdf.slice(0, 5).toString() === "%PDF-",
    );
    await browser.close();

    //////////////////////////////////////////////////////////////////////////
    const pdfDir = path.resolve("tmp-pdf");
    await fs.mkdir(pdfDir, { recursive: true });

    const fileName = `${doc.documentNumber}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    await fs.writeFile(filePath, pdf);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.documentNumber)}.pdf`,
    );

    res.end(pdf);
  } catch (e) {
    console.error("getDocumentPdf error:", e);
    res.status(500).json({ message: e.message });
  }
}

export async function getDocumentNotifications(req, res) {
  try {
    const { id } = req.params;

    const logs = await getDocumentNotificationsService(req.user, Number(id));

    res.json(logs);
  } catch (e) {
    console.error("getDocumentNotifications error:", e.message);
    res.status(403).json({ message: e.message });
  }
}

export async function loadStampBase64(status) {
  const map = {
    SIGNED: "SIGNED.png",
    REJECTED: "REJECTED.png",
    REVISION: "REVISION.png",
  };

  const file = map[status];

  if (!file) return null;

  const filePath = path.join(process.cwd(), "pdf", "stamps", file);

  if (!existsSync(filePath)) return null;

  const buffer = await fs.readFile(filePath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function retryDocumentNotificationsController(req, res) {
  try {
    const { id } = req.params;

    const result = await retryDocumentNotifications(req.user, Number(id));

    res.json(result);
  } catch (e) {
    console.error("retryDocumentNotifications error:", e.message);
    res.status(403).json({ message: e.message });
  }
}
