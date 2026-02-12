import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "Product.json"
);

export async function loadProducts() {
  try {
    await fs.access(productFile);
  } catch {
    return;
  }

  let raw = await fs.readFile(productFile, "utf-8");
  raw = raw
    .replace(/^\uFEFF/, "")
    .replace(/\u0000/g, "")
    .replace(/,\s*(?=[}\]])/g, "");

  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    console.error("Ошибка парсинга Product.json:", e.message);
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.warn("Product.json пуст — импорт пропущен");
    return;
  }

  const usedProductIds = new Set();
  const usedGroupIds = new Set();

  /** ----------------------------------------
   *  1️⃣ Подготовка уникальных групп
   * ---------------------------------------- */
  const groupsMap = new Map(); // group_1c_id → name

  for (const row of items) {
    if (row.group_id && row.group_name) {
      groupsMap.set(row.group_id, row.group_name);
      usedGroupIds.add(row.group_id);
    }
  }

  /** ----------------------------------------
   *  2️⃣ Upsert групп
   * ---------------------------------------- */
  for (const [group1cId, groupName] of groupsMap.entries()) {
    try {
      await pool.query(
        `
        INSERT INTO product_groups (id_1c, name)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          is_active = 1
        `,
        [group1cId, groupName]
      );
    } catch (err) {
      console.error("Ошибка импорта группы:", group1cId, err);
    }
  }

  /** ----------------------------------------
   *  3️⃣ Загружаем id групп в память
   * ---------------------------------------- */
  const [groupRows] = await pool.query(
    `
    SELECT id, id_1c
    FROM product_groups
    WHERE id_1c IN (?)
    `,
    [Array.from(usedGroupIds)]
  );

  const groupIdMap = new Map(); // group_1c_id → internal id
  for (const g of groupRows) {
    groupIdMap.set(g.id_1c, g.id);
  }

  /** ----------------------------------------
   *  4️⃣ Импорт товаров
   * ---------------------------------------- */
  for (const row of items) {
    try {
      if (!row.product_id || !row.product_name || !row.group_id) {
        console.warn("Пропущена некорректная строка:", row);
        continue;
      }

      const groupId = groupIdMap.get(row.group_id);
      if (!groupId) {
        console.error(
          `Группа ${row.group_id} не найдена для товара ${row.product_id}`
        );
        continue;
      }

      await pool.query(
        `
        INSERT INTO products (id_1c, name, group_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          group_id = VALUES(group_id),
          is_active = 1
        `,
        [row.product_id, row.product_name, groupId]
      );

      usedProductIds.add(row.product_id);
    } catch (err) {
      console.error("Ошибка обработки продукта:", row.product_id, err);
    }
  }

  /** ----------------------------------------
   *  5️⃣ Деактивация отсутствующих
   * ---------------------------------------- */
  if (usedProductIds.size > 0) {
    await pool.query(
      `
      UPDATE products
      SET is_active = 0
      WHERE id_1c NOT IN (?)
      `,
      [Array.from(usedProductIds)]
    );
  }

  if (usedGroupIds.size > 0) {
    await pool.query(
      `
      UPDATE product_groups
      SET is_active = 0
      WHERE id_1c NOT IN (?)
      `,
      [Array.from(usedGroupIds)]
    );
  }

  await fs.unlink(productFile);
  console.log(
    `Product.json импортирован: групп=${usedGroupIds.size}, товаров=${usedProductIds.size}`
  );
}
