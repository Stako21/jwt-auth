import nodemailer from "nodemailer";
import fetch from "node-fetch";
import puppeteer from "puppeteer";
import { renderExchangeHtml } from "../pdf/exchange.template.js";
import { renderReturnHtml } from "../pdf/return.template.js";
import { getDocumentByIdService } from "./DocumentService.js";
import pool from "../db.cjs";
import FormData from "form-data";
import { loadStampBase64 } from "../controllers/documentsController.js";

async function logNotification({
  documentId,
  channel,
  target,
  status,
  errorText = null,
}) {
  await pool.query(
    `
    INSERT INTO notification_log
      (document_id, channel, target, status, error_text)
    VALUES (?, ?, ?, ?, ?)
    `,
    [documentId, channel, target, status, errorText],
  );
}

async function loadRegionNtification(city) {
  const [rows] = await pool.query(
    `
    SELECT email, rocket_channel
    FROM region_notifications
    WHERE city = ? AND is_active = 1
    `,
    [city],
  );

  return {
    emails: rows
      .map((r) => r.email)
      .filter((email) => email && email.trim() !== ""),
    rocketChannel: rows[0]?.rocket_channel || null,
  };
}

export async function generatePdfBuffer(doc) {
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

  form.append("file", pdfBinary, {
    filename: `${doc.documentNumber}.pdf`,
    contentType: "application/pdf",
  });
  form.append(
    "msg",
    `📄 *Документ підписано*\n*TA - ${doc.author}*\n${doc.documentNumber}`,
  );

  const res = await fetch(
    `${process.env.ROCKET_URL}/api/v1/rooms.upload/${roomId}`,
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

  const data = await res.json();

  console.log("Rocket upload response:", data);

  if (!data.success) {
    throw new Error(`Rocket.Chat upload error: ${data.error || "unknown"}`);
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

  const data = await res.json();

  if (!data.success) {
    throw new Error(`Rocket.Chat rooms.info error: ${data.error}`);
  }

  return data.room._id;
}

export async function notifyDocumentSigned(user, documentId) {
  const doc = await getDocumentByIdService(user, documentId);

  const { emails, rocketChannel } = await loadRegionNtification(doc.city);

  console.log("Emails", emails);
  console.log("rocketChannel", rocketChannel);

  if (emails.length === 0 && !rocketChannel) {
    console.warn(`Нет получателей для региона: ${doc.city}`);
    return;
  }

  const pdfBuffer = await generatePdfBuffer(doc);

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
      throw err;
    }

    if (rocketChannel) {
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

        throw err;
      }
    }
  }
}
