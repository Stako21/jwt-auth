import nodemailer from "nodemailer";
import fetch from "node-fetch";

export function createSmtpTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: 587, secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
}

export async function sendTextEmail({ to, subject, text }) {
  await createSmtpTransport().sendMail({ from: `"Documents" <${process.env.SMTP_USER}>`, to: to.join(","), subject, text });
}

export async function parseRocketApiResponse(response, context) {
  let data;
  try { data = JSON.parse(await response.text()); } catch {
    throw new Error(`Rocket.Chat ${context}: некоректна відповідь (HTTP ${response.status})`);
  }
  if (!response.ok || !data?.success) throw new Error(`Rocket.Chat ${context}: помилка (HTTP ${response.status})`);
  return data;
}

export async function getRoomIdByName(channelName) {
  const response = await fetch(`${process.env.ROCKET_URL}/api/v1/rooms.info?roomName=${encodeURIComponent(channelName.replace(/^#/, ""))}`, {
    headers: { "X-Auth-Token": process.env.ROCKET_TOKEN, "X-User-Id": process.env.ROCKET_USER_ID },
    signal: AbortSignal.timeout(15000),
  });
  const data = await parseRocketApiResponse(response, "rooms.info");
  if (!data.room?._id) throw new Error("Rocket.Chat: кімнату не знайдено");
  return data.room._id;
}

export async function sendTextRocket(channel, text) {
  const roomId = await getRoomIdByName(channel);
  const response = await fetch(`${process.env.ROCKET_URL}/api/v1/chat.postMessage`, {
    method: "POST",
    headers: { "X-Auth-Token": process.env.ROCKET_TOKEN, "X-User-Id": process.env.ROCKET_USER_ID, "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, text }), signal: AbortSignal.timeout(15000),
  });
  await parseRocketApiResponse(response, "chat.postMessage");
}
