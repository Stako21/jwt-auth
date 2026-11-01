import fetch from "node-fetch";
import puppeteer from "puppeteer";
import { renderExchangeHtml } from "../pdf/exchange.template.js";
import { renderReturnHtml } from "../pdf/return.template.js";
import { getDocumentByIdService } from "./DocumentService.js";
import pool from "../db.cjs";
import FormData from "form-data";
import { createSmtpTransport, sendTextEmail, sendTextRocket, getRoomIdByName, parseRocketApiResponse } from "./notificationTransports.js";
import { loadNotificationRecipients } from "./notificationRecipients.service.js";
import { inferTroEvent, TRO_EVENTS } from "./notificationPolicy.js";
import { loadStampBase64 } from "../controllers/documentsController.js";

async function logNotification({
  documentId,
  channel,
  target,
  status,
  errorText = null,
  eventType = "SIGNED_PDF",
  eventPayload = null,
}) {
  await pool.query(
    `
    INSERT INTO notification_log
      (document_id, channel, event_type, event_payload, target, status, error_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [documentId, channel, eventType, eventPayload ? JSON.stringify(eventPayload) : null, target, status, errorText],
  );
}

export async function generatePdfBuffer(doc) {
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

  const stampBase64 = await loadStampBase64(doc.status);

  const html =
    doc.documentType === "RETURN"
      ? renderReturnHtml(doc, stampBase64)
      : renderExchangeHtml(doc, stampBase64);

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
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

  return pdfBuffer;
}

export async function sendEmailWithPdf(doc, pdfBuffer, emails) {
  const transporter = createSmtpTransport();

  const mailOptions = {
    from: `"Documents" <${process.env.SMTP_USER}>`,
    to: emails.join(","),
    subject: `Підписано: ${doc.documentNumber}`,
    text: `TA - ${doc.author}\n Документ ${doc.documentNumber} підписано.`,
    attachments: [
      {
        filename: `${doc.documentNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
}

export async function sendRocketMessage(doc, rocketChannel, pdfBuffer) {
  // const res = await fetch(`${process.env.ROCKET_URL}/api/v1/chat.postMessage`, {
  //   method: "POST",
  //   headers: {
  //     "X-Auth-Token": process.env.ROCKET_TOKEN,
  //     "X-User-Id": process.env.ROCKET_USER_ID,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     channel: rocketChannel.replace(/^#/, ""),
  //     text: `📄 *Документ підписано*\n${doc.documentNumber}`,
  //   }),
  // });

  // const data = await res.json();
  const roomId = await getRoomIdByName(rocketChannel);
  await uploadPdfToRocket(roomId, pdfBuffer, doc);

  // console.log("Rocket.Chat response:", data);

  // if (!data.success) {
  //   throw new Error(`Rocket.Chat error: ${data.error || "unknown"}`);
  // }
}

async function uploadPdfToRocket(roomId, pdfBuffer, doc) {
  const form = new FormData();
  const pdfBinary = Buffer.isBuffer(pdfBuffer)
    ? pdfBuffer
    : Buffer.from(pdfBuffer);
  const rocketMessage = `Document signed\nTA - ${doc.author}\n${doc.documentNumber}`;

  form.append("file", pdfBinary, {
    filename: `${doc.documentNumber}.pdf`,
    contentType: "application/pdf",
  });
  form.append(
    "msg",
    `📄 *Документ підписано*\n*TA - ${doc.author}*\n${doc.documentNumber}`,
  );

  const uploadRes = await fetch(
    `${process.env.ROCKET_URL}/api/v1/rooms.media/${roomId}`,
    {
      method: "POST",
      headers: {
        "X-Auth-Token": process.env.ROCKET_TOKEN,
        "X-User-Id": process.env.ROCKET_USER_ID,
        ...form.getHeaders(),
      },
      body: form,
    },
  );

  const uploadData = await parseRocketApiResponse(uploadRes, "rooms.media");
  const fileId = uploadData?.file?._id;

  if (!uploadData.success || !fileId) {
    throw new Error("Rocket.Chat rooms.media did not return an uploaded file id");
  }

  const confirmRes = await fetch(
    `${process.env.ROCKET_URL}/api/v1/rooms.mediaConfirm/${roomId}/${fileId}`,
    {
      method: "POST",
      headers: {
        "X-Auth-Token": process.env.ROCKET_TOKEN,
        "X-User-Id": process.env.ROCKET_USER_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msg: rocketMessage,
      }),
    },
  );

  const confirmData = await parseRocketApiResponse(
    confirmRes,
    "rooms.mediaConfirm",
  );

  if (!confirmData.success) {
    throw new Error(
      `Rocket.Chat rooms.mediaConfirm error: ${confirmData.error || "unknown"}`,
    );
  }
}

export async function notifyDocumentSigned(user, documentId) {
  const doc = await getDocumentByIdService(user, documentId);

  const { emails, rocketChannels } = await loadNotificationRecipients(doc.city, doc.branchId, { documentType: doc.documentType });

  if (emails.length === 0 && rocketChannels.length === 0) {
    console.warn(`No notification recipients for region: ${doc.city}`);
    return;
  }

  const pdfBuffer = await generatePdfBuffer(doc);
  let firstError = null;

  if (emails.length) {
    try {
      await sendEmailWithPdf(doc, pdfBuffer, emails);

      for (const email of emails) {
        if (!email || email.trim() === "") continue;

        await logNotification({
          documentId: doc.id,
          channel: "EMAIL",
          target: email,
          status: "SUCCESS",
        });
      }
    } catch (err) {
      for (const email of emails) {
        await logNotification({
          documentId: doc.id,
          channel: "EMAIL",
          target: email,
          status: "ERROR",
          errorText: err.message,
        });
      }
      firstError = firstError || err;
    }
  }

  if (rocketChannels.length) {
    for (const rocketChannel of rocketChannels) {
      try {
        await sendRocketMessage(doc, rocketChannel, pdfBuffer);

        await logNotification({
          documentId: doc.id,
          channel: "ROCKET",
          target: rocketChannel,
          status: "SUCCESS",
        });
      } catch (err) {
        await logNotification({
          documentId: doc.id,
          channel: "ROCKET",
          target: rocketChannel,
          status: "ERROR",
          errorText: err.message,
        });

        firstError = firstError || err;
      }
    }
  }

  if (firstError) {
    throw firstError;
  }
}

export function buildTroNotificationMessage(doc, oldStatus, newStatus, eventCode = inferTroEvent(oldStatus, newStatus)) {
  const label = TRO_EVENTS.find((event) => event.value === eventCode)?.label || "Зміна статусу";
  return {
    subject: `ТРО ${doc.documentNumber}: ${label}`,
    text: [
      `Документ ТРО ${doc.documentNumber}`,
      eventCode === "TRO_CREATED" ? "Створено нову заявку ТРО." : `${label}. Статус: ${oldStatus} → ${newStatus}`,
      `ТА: ${doc.tro?.taName || doc.author || "—"}`,
    ].join("\n"),
  };
}

function deliveryMessage(doc, oldStatus, newStatus, snapshot) {
  return typeof snapshot?.subject === "string" && typeof snapshot?.text === "string"
    ? { subject: snapshot.subject, text: snapshot.text }
    : buildTroNotificationMessage(doc, oldStatus, newStatus, snapshot?.eventCode);
}

export async function sendDocumentStatusEmail(doc, oldStatus, newStatus, emails, snapshot) {
  await sendTextEmail({ to: emails, ...deliveryMessage(doc, oldStatus, newStatus, snapshot) });
}

export async function sendDocumentStatusRocket(doc, oldStatus, newStatus, rocketChannel, snapshot) {
  await sendTextRocket(rocketChannel, deliveryMessage(doc, oldStatus, newStatus, snapshot).text);
}

export function createTroNotificationSender({
  getDocument = getDocumentByIdService, loadRecipients = loadNotificationRecipients,
  sendEmail = sendDocumentStatusEmail, sendRocket = sendDocumentStatusRocket, log = logNotification,
} = {}) {
  return async (user, documentId, oldStatus, newStatus, eventCode = inferTroEvent(oldStatus, newStatus)) => {
    if (!TRO_EVENTS.some((event) => event.value === eventCode)) return;
    const doc = await getDocument(user, documentId);
    const { emails, rocketChannels } = await loadRecipients(doc.city, doc.branchId, { documentType: doc.documentType, eventCode });
    if (!emails.length && !rocketChannels.length) return;
    const eventType = eventCode === "TRO_CREATED" ? "TRO_CREATED" : "STATUS_CHANGE";
    const eventPayload = { eventCode, oldStatus, newStatus, ...buildTroNotificationMessage(doc, oldStatus, newStatus, eventCode) };
    let firstError = null;
    const deliver = async (channel, target, send) => {
      let error = null;
      try { await send(); } catch (failure) { error = failure; firstError ||= failure; }
      for (const address of (Array.isArray(target) ? target : [target])) {
        await log({ documentId, channel, target: address, eventType, eventPayload,
          status: error ? "ERROR" : "SUCCESS", errorText: error ? "Не вдалося надіслати сповіщення" : null });
      }
    };
    if (emails.length) await deliver("EMAIL", emails, () => sendEmail(doc, oldStatus, newStatus, emails, eventPayload));
    for (const channel of rocketChannels) await deliver("ROCKET", channel, () => sendRocket(doc, oldStatus, newStatus, channel, eventPayload));
    if (firstError) throw firstError;
  };
}

export const notifyDocumentStatusChanged = createTroNotificationSender();
