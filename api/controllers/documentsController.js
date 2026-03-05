import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { renderDocumentHtml } from "../pdf/documentTemplate.js";
import { renderReturnHtml } from "../pdf/return.template.js";
import { renderExchangeHtml } from "../pdf/exchange.template.js";
import { getDocumentNotificationHistoryService, getDocumentsService } from "../services/DocumentService.js";
import {
  createDocumentService,
  signDocumentService,
  prepareDocumentService,
  revisionDocumentService,
  rejectDocumentService,
  getDocumentByIdService,
  getDocumentHistoryService,
  updateDocumentService,
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

export async function prepareDocument(req, res) {
  try {
    const result = await prepareDocumentService(
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

    if (doc.signedBy) {
      const signer = await UserRepository.getUserById(doc.signedBy);

      doc.signerName = signer ? signer.user_name : "";
    }

    const stampBase64 = await loadStampBase64(doc.status);

    const html =
      doc.documentType === "RETURN"
        ? renderReturnHtml(doc, stampBase64)
        : renderExchangeHtml(doc, stampBase64);

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

    await browser.close();

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
    PREPARED: "PREPARED.png",
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

export async function getDocumentHistory(req, res) {
  try {
    const { id } = req.params;

    const history = await getDocumentHistoryService(req.user, Number(id));

    res.json(history);
  } catch (e) {
    console.error("getDocumentHistory error:", e.message);
    res.status(403).json({ message: e.message });
  }
}

export async function updateDocument(req, res) {
  try {
    const { id } = req.params;
    const payload = req.body;

    const result = await updateDocumentService(req.user, Number(id), payload);

    res.json(result);
  } catch (e) {
    console.error("updateDocument error:", e.message);
    res.status(400).json({ message: e.message });
  }
}

export async function getDocumentNotificationHistory(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;

    const data = await getDocumentNotificationHistoryService(user, id);

    res.json(data);
  } catch (err) {
    console.error("Notification history error:", err);
    res.status(500).json({ message: err.message });
  }
}
