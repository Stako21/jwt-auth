import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tradePointFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "TradePoint.json",
);

export async function loadTradePoints() {
  try {
    await fs.access(tradePointFile);
  } catch {
    return;
  }

  let raw = await fs.readFile(tradePointFile, "utf-8");
  raw = raw
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/,\s*(?=[}\]])/g, "");

  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    console.error("Ошибка парсинга TradePoint.json:", e.message);
    return;
  }

  if (!Array.isArray(items) || items.length === 0) return;

  const usedTradePoints = new Set();
  const usedContractors = new Set();

  for (const row of items) {
    try {
      if (!row.trade_point_id || !row.contractor_id) continue;

      // 1️⃣ Контрагент
      await pool.query(
        `
        INSERT INTO contractors (id_1c, name)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          is_active = 1
        `,
        [row.contractor_id, row.contractor_name],
      );

      const [[contractor]] = await pool.query(
        `SELECT id FROM contractors WHERE id_1c = ?`,
        [row.contractor_id],
      );

      // 2️⃣ Торговая точка
      await pool.query(
        `
        INSERT INTO trade_points (id_1c, name, address, contractor_id)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          address = VALUES(address),
          contractor_id = VALUES(contractor_id),
          is_active = 1
        `,
        [
          row.trade_point_id,
          row.trade_point_name,
          row.trade_point_address,
          contractor.id,
        ],
      );

      usedTradePoints.add(row.trade_point_id);
      usedContractors.add(row.contractor_id);
    } catch (err) {
      console.error("Ошибка обработки ТТ:", err);
    }
  }

  // 3️⃣ Деактивация
  await pool.query(
    `
    UPDATE trade_points
    SET is_active = 0
    WHERE id_1c NOT IN (?)
    `,
    [Array.from(usedTradePoints)],
  );

  await pool.query(
    `
    UPDATE contractors
    SET is_active = 0
    WHERE id_1c NOT IN (?)
    `,
    [Array.from(usedContractors)],
  );

  await fs.unlink(tradePointFile);
  console.log("TradePoint.json импортирован и удалён");
}
