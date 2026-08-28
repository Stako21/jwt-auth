import nodemailer from "nodemailer";
import fetch from "node-fetch";
import puppeteer from "puppeteer";
import { renderExchangeHtml } from "../pdf/exchange.template.js";
import { renderReturnHtml } from "../pdf/return.template.js";
import { getDocumentByIdService } from "./DocumentService.js";
import pool from "../db.cjs";
import FormData from "form-data";
import { loadStampBase64 } from "../controllers/documentsController.js";

async function parseRocketApiResponse(res, contextLabel) {
  const rawBody = await res.text();
  const contentType = res.headers.get("content-type") || "";

  let parsedBody = null;

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      if (!res.ok) {
        const trimmedBody = rawBody.trim().slice(0, 300);

        throw new Error(
          `Rocket.Chat ${contextLabel} failed (${res.status} ${res.statusText}): ${trimmedBody || "non-JSON response"}`,
        );
      }

      throw new Error(
        `Rocket.Chat ${contextLabel} returned invalid JSON (content-type: ${contentType || "unknown"})`,
      );
    }
  }

  if (!res.ok) {
    const errorMessage =
      parsedBody?.error ||
      parsedBody?.message ||
      `${res.status} ${res.statusText}`.trim();

    throw new Error(`Rocket.Chat ${contextLabel} error: ${errorMessage}`);
  }

  if (!parsedBody) {
    throw new Error(`Rocket.Chat ${contextLabel} returned an empty response`);
  }

  return parsedBody;
}

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

async function loadRegionNtification(city, branchId) {
  const [rows] = await pool.query(
    `
    SELECT email, rocket_channel
    FROM region_notifications
    WHERE city = ?
      AND branch_id = ?
      AND is_active = 1
    `,
    [city, branchId],
  );

  return {
    emails: [
      ...new Set(
        rows
          .map((r) => r.email)
          .filter((email) => email && email.trim() !== ""),
      ),
    ],
    rocketChannels: [
      ...new Set(
        rows
          .map((r) => r.rocket_channel)
          .filter((channel) => channel && channel.trim() !== ""),
      ),
    ],
  };
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
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

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

async function getRoomIdByName(channelName) {
  const cleanName = channelName.replace(/^#/, "");

  const res = await fetch(
    `${process.env.ROCKET_URL}/api/v1/rooms.info?roomName=${cleanName}`,
    {
      headers: {
        "X-Auth-Token": process.env.ROCKET_TOKEN,
        "X-User-Id": process.env.ROCKET_USER_ID,
      },
    },
  );

  const data = await parseRocketApiResponse(res, "rooms.info");

  if (!data.success) {
    throw new Error(`Rocket.Chat rooms.info error: ${data.error}`);
  }

  return data.room._id;
}

export async function notifyDocumentSigned(user, documentId) {
  const doc = await getDocumentByIdService(user, documentId);

  const { emails, rocketChannels } = await loadRegionNtification(doc.city, doc.branchId);

  console.log("Emails", emails);
  console.log("rocketChannels", rocketChannels);

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

function statusMessage(doc, oldStatus, newStatus) {
  return [
    `Документ ТРО ${doc.documentNumber}`,
    `Статус: ${oldStatus} → ${newStatus}`,
    `ТА: ${doc.tro?.taName || doc.author || "—"}`,
  ].join("\n");
}

export async function sendDocumentStatusEmail(doc, oldStatus, newStatus, emails) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Documents" <${process.env.SMTP_USER}>`,
    to: emails.join(","),
    subject: `ТРО ${doc.documentNumber}: ${oldStatus} → ${newStatus}`,
    text: statusMessage(doc, oldStatus, newStatus),
  });
}

export async function sendDocumentStatusRocket(doc, oldStatus, newStatus, rocketChannel) {
  const roomId = await getRoomIdByName(rocketChannel);
  const response = await fetch(`${process.env.ROCKET_URL}/api/v1/chat.postMessage`, {
    method: "POST",
    headers: {
      "X-Auth-Token": process.env.ROCKET_TOKEN,
      "X-User-Id": process.env.ROCKET_USER_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, text: statusMessage(doc, oldStatus, newStatus) }),
  });
  const result = await parseRocketApiResponse(response, "chat.postMessage");
  if (!result.success) throw new Error("Rocket.Chat did not accept the message");
}

export async function notifyDocumentStatusChanged(user, documentId, oldStatus, newStatus) {
  const doc = await getDocumentByIdService(user, documentId);
  const { emails, rocketChannels } = await loadRegionNtification(doc.city, doc.branchId);
  if (!emails.length && !rocketChannels.length) return;
  const eventPayload = { oldStatus, newStatus };
  let firstError = null;

  if (emails.length) {
    try {
      await sendDocumentStatusEmail(doc, oldStatus, newStatus, emails);
      for (const email of emails) {
        await logNotification({ documentId, channel: "EMAIL", eventType: "STATUS_CHANGE", eventPayload, target: email, status: "SUCCESS" });
      }
    } catch (error) {
      for (const email of emails) {
        await logNotification({ documentId, channel: "EMAIL", eventType: "STATUS_CHANGE", eventPayload, target: email, status: "ERROR", errorText: error.message });
      }
      firstError = error;
    }
  }

  for (const rocketChannel of rocketChannels) {
    try {
      await sendDocumentStatusRocket(doc, oldStatus, newStatus, rocketChannel);
      await logNotification({ documentId, channel: "ROCKET", eventType: "STATUS_CHANGE", eventPayload, target: rocketChannel, status: "SUCCESS" });
    } catch (error) {
      await logNotification({ documentId, channel: "ROCKET", eventType: "STATUS_CHANGE", eventPayload, target: rocketChannel, status: "ERROR", errorText: error.message });
      firstError ||= error;
    }
  }

  if (firstError) throw firstError;
}
