import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";

const __filename = fileURLToPath(import.meta.url);
console.log(__filename);

const __dirname = path.dirname(__filename);
const salesAgentFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "SalesAgent.json"
);

export async function loadSalesAgents() {
  try {
    // Проверяем наличие файла
    try {
      await fs.access(salesAgentFile);
    } catch {
      // файла нет — это нормально
      return;
    }

    // читаем и "санитизируем" содержимое один раз
    let raw = await fs.readFile(salesAgentFile, "utf-8");
    raw = raw.replace(/^\uFEFF/, ""); // убрать BOM
    raw = raw.replace(/\u0000/g, ""); // убрать нулевые байты
    raw = raw.replace(/,\s*(?=[}\]])/g, ""); // убрать завершающие запятые перед } или ]

    let agents;
    try {
      agents = JSON.parse(raw);
      console.log(
        "JSON parse успешен, агентов:",
        Array.isArray(agents) ? agents.length : "не массив"
      );
    } catch (e) {
      console.error("JSON parse error:", e.message);
      console.error("Первые 200 символов файла:", raw.slice(0, 200));
      await fs.writeFile(salesAgentFile + ".sanitized.json", raw, "utf8"); // для отладки
      throw e;
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      console.warn(
        "Файл SalesAgents.json пуст или не содержит массив агентов."
      );
      return;
    }

    for (const agent of agents) {
      try {
        if (!agent || !agent.login) {
          console.warn("Пропущена запись агента без login:", agent);
          continue;
        }

        // ищем пользователя в users по login
        const [userRows] = await pool.query(
          "SELECT id FROM users WHERE NAME = ?",
          [agent.login]
        );
        if (userRows.length === 0) {
          console.warn(`Пользователь ${agent.login} не найден в users`);
          continue;
        }
        const userId = userRows[0].id;

        // обновляем или вставляем запись
        await pool.query(
          `INSERT INTO sales_agents (user_id, login, full_name, supervisor_name, city)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
              full_name = VALUES(full_name),
              supervisor_name = VALUES(supervisor_name),
              city = VALUES(city)`,
          [
            userId,
            agent.login,
            agent.currentAgent,
            agent.supervisor,
            agent.regionalDivision,
          ]
        );
      } catch (rowErr) {
        console.error("Ошибка при обработке записи агента:", rowErr);
        // продолжаем со следующими записями
      }
    }

    console.log("SalesAgents обновлены");

    try {
      await fs.unlink(salesAgentFile);
      console.log("SalesAgents.json успешно удалён после импорта");
    } catch (unlinkErr) {
      console.error("Не удалось удалить SalesAgents.json:", unlinkErr);
    }

    // 🔁 синхронизация имен пользователей из 1С
    await syncUserNamesFromSalesAgents();
  } catch (err) {
    console.error("Ошибка загрузки SalesAgent.json:", err);
  }
}

async function syncUserNamesFromSalesAgents() {
  const [result] = await pool.query(`
    UPDATE users u
    JOIN sales_agents sa ON sa.user_id = u.id
    SET u.user_name = sa.full_name
    WHERE
      sa.full_name IS NOT NULL
      AND sa.full_name <> ''
  `);

  console.log(
    `users.user_name синхронизированы, обновлено строк: ${result.affectedRows}`
  );
}
