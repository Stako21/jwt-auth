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
  const connection = await pool.getConnection();

  try {
    /* 1. Проверка файла */
    try {
      await fs.access(salesFile);
    } catch {
      return;
    }

    let raw = await fs.readFile(salesFile, "utf-8");
    raw = raw.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
    raw = raw.replace(/,\s*(?=[}\]])/g, "");

    const reports = JSON.parse(raw);
    if (!Array.isArray(reports) || reports.length === 0) return;

    const reportDate =
      reports[0]?.date?.split("T")[0] ??
      new Date().toISOString().split("T")[0];

    await connection.beginTransaction();

    /* 2. Создаём import */
    const [importRes] = await connection.query(
      `
      INSERT INTO report_imports (report_date, imported_at, rows_total)
      VALUES (?, NOW(), ?)
      `,
      [reportDate, reports.length]
    );
    const importId = importRes.insertId;

    /* 3. Ключи документов из текущей выгрузки */
    const incomingKeys = new Set();
    for (const r of reports) {
      incomingKeys.add(`${r.number}||${r.loginAgent}`);
    }

    /* 4. Основная обработка файла */
    for (const r of reports) {
      const docDate = r.date.split("T")[0];

      const [[user]] = await connection.query(
        `SELECT id FROM users WHERE NAME = ? AND is_active = 1`,
        [r.loginAgent]
      );
      const userId = user?.id ?? null;

      const [[existing]] = await connection.query(
        `
        SELECT *
        FROM sales_reports
        WHERE document_number = ?
          AND login_agent = ?
        ORDER BY
          CASE status
            WHEN 'ACTIVE' THEN 1
            WHEN 'MOVED' THEN 2
            ELSE 3
          END,
          created_at DESC
        LIMIT 1
        `,
        [r.number, r.loginAgent]
      );

      /* --- НОВАЯ НАКЛАДНАЯ --- */
      if (!existing) {
        await connection.query(
          `
          INSERT INTO sales_reports (
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
            status,
            import_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
          `,
          [
            docDate,
            r.number,
            r.date,
            r.loginAgent,
            userId,
            r.salesAgent,
            r.amount,
            r.pointOfSale,
            r.customer,
            r.comment,
            r.form2 ? 1 : 0,
            importId,
          ]
        );
        continue;
      }

      const existingDate =
        existing.document_date?.toISOString().slice(0, 10);

      /* --- ТА ЖЕ ДАТА → ПРОСТО ОБНОВЛЯЕМ --- */
      if (existingDate === docDate) {
        await connection.query(
          `
          UPDATE sales_reports
          SET status = 'ACTIVE',
              change_comment = NULL,
              amount = ?,
              import_id = ?
          WHERE id = ?
          `,
          [r.amount, importId, existing.id]
        );
        continue;
      }

      /* --- ПЕРЕНОС (MOVED) --- */
      const moveComment = `Перенесено з ${existingDate} на ${docDate}, сума ${r.amount}`;

      await connection.query(
        `
        UPDATE sales_reports
        SET status = 'MOVED',
            amount = 0,
            change_comment = ?
        WHERE id = ?
        `,
        [moveComment, existing.id]
      );

      const [newRes] = await connection.query(
        `
        INSERT INTO sales_reports (
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
          status,
          import_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
        `,
        [
          docDate,
          r.number,
          r.date,
          r.loginAgent,
          userId,
          r.salesAgent,
          r.amount,
          r.pointOfSale,
          r.customer,
          r.comment,
          r.form2 ? 1 : 0,
          importId,
        ]
      );

      await connection.query(
        `
        UPDATE sales_reports
        SET replaced_by_id = ?
        WHERE id = ?
        `,
        [newRes.insertId, existing.id]
      );
    }

    /* 5. CANCELLED — только те, кого НЕТ в текущей выгрузке */
    await connection.query(
      `
      UPDATE sales_reports
      SET status = 'CANCELLED',
          change_comment = 'Реалізація відмінена (відсутня в останньому звіті)'
      WHERE status = 'ACTIVE'
        AND report_date >= DATE_SUB(?, INTERVAL 5 DAY)
        AND CONCAT(document_number, '||', login_agent) NOT IN (?)
      `,
      [reportDate, Array.from(incomingKeys)]
    );

    /* 6. Чистка старше 5 дней */
    await connection.query(
      `
      DELETE sr, ri
      FROM sales_reports sr
      JOIN report_imports ri ON sr.import_id = ri.id
      WHERE ri.report_date < DATE_SUB(?, INTERVAL 5 DAY)
      `,
      [reportDate]
    );

    await connection.commit();
    await fs.unlink(salesFile);

    console.log(`SalesReports загружены, import_id=${importId}`);
  } catch (err) {
    await connection.rollback();
    console.error("Ошибка загрузки SalesReport.json:", err);
  } finally {
    connection.release();
  }
}