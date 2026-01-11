import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.cjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const salesFile = path.join(
  __dirname,
  "..",
  "..",
  "client",
  "public",
  "Sorce",
  "SalesReport.json"
);

export async function loadSalesReports() {
  try {
    // Проверяем наличие файла
    try {
      await fs.access(salesFile);
    } catch {
      // файла нет — это нормально
      return;
    }

    // читаем и "санитизируем" содержимое один раз
    let raw = await fs.readFile(salesFile, "utf-8");
    raw = raw.replace(/^\uFEFF/, ""); // убрать BOM
    raw = raw.replace(/\u0000/g, ""); // убрать нулевые байты
    raw = raw.replace(/,\s*(?=[}\]])/g, ""); // убрать завершающие запятые перед } или ]

    let reports;
    try {
      reports = JSON.parse(raw);
      console.log(
        "JSON parse успешен, записей:",
        Array.isArray(reports) ? reports.length : "не массив"
      );
    } catch (e) {
      console.error("JSON parse error:", e.message);
      console.error("Первые 200 символов файла:", raw.slice(0, 200));
      await fs.writeFile(salesFile + ".sanitized.json", raw, "utf8"); // для отладки
      throw e;
    }

    if (!Array.isArray(reports) || reports.length === 0) {
      console.warn(
        "Файл SalesReport.json пуст или не содержит массив записей."
      );
      return;
    }

    // Получаем report_date из первой записи (без времени), fallback на текущую дату при отсутствии
    let reportDate = null;
    if (reports[0] && typeof reports[0].date === "string") {
      reportDate = reports[0].date.split("T")[0];
    }
    if (!reportDate) {
      console.warn(
        "Не найдено report_date в первой записи, используем текущую дату."
      );
      reportDate = new Date().toISOString().split("T")[0];
    }

    // Создаём запись импорта
    let importId;
    try {
      const [importResult] = await pool.query(
        "INSERT INTO report_imports (report_date, imported_at, rows_total) VALUES (?, NOW(), ?)",
        [reportDate, reports.length]
      );
      importId = importResult.insertId;
    } catch (dbErr) {
      console.error("Ошибка при создании записи импорта:", dbErr);
      throw dbErr;
    }

    // Загружаем записи (только если найден sales_agent)
    for (const report of reports) {
      try {
        const [userRows] = await pool.query(
          "SELECT id FROM users WHERE NAME = ?",
          [report.loginAgent]
        );

        const userId = userRows.length ? userRows[0].id : null;

        await pool.query(
  `INSERT IGNORE INTO sales_reports
    (
      report_date,
      document_number,
      document_date,
      login_agent,
      user_id,
      sales_agent_name,
      amount,
      point_of_sale,
      customer,
      comment,
      form2,
      import_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    report.date,
    report.number,
    report.date,
    report.loginAgent,
    userId,
    report.salesAgent,
    report.amount,
    report.pointOfSale,
    report.customer,
    report.comment,
    report.form2 ? 1 : 0,
    importId,
  ]
);

      } catch (rowErr) {
        console.error("Ошибка при загрузке строки отчёта:", rowErr);
        // продолжаем со следующими записями
      }
    }

    console.log(`SalesReports загружены, import_id=${importId}`);

    // Удаляем файл после успешного импорта
    try {
      await fs.unlink(salesFile);
      console.log("SalesReport.json успешно удалён после импорта");
    } catch (unlinkErr) {
      console.error("Не удалось удалить SalesReport.json:", unlinkErr);
    }

    // Удаляем старые отчёты старше 5 дней
    try {
      await pool.query(
        `DELETE sr, ri FROM sales_reports sr
         JOIN report_imports ri ON sr.import_id = ri.id
         WHERE ri.report_date < DATE_SUB(CURDATE(), INTERVAL 5 DAY)`
      );
    } catch (delErr) {
      console.error("Ошибка при удалении старых отчётов:", delErr);
    }
  } catch (err) {
    console.error("Ошибка загрузки SalesReport.json:", err);
  }
}
