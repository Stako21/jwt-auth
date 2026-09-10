import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import XLSX from "xlsx";
import {
  inspectBalanceWorkbook,
  normalizeBalanceColumnConfig,
  validateBalanceWorkbookConfiguration,
} from "../services/balanceWorkbookConfig.service.js";

async function createWorkbook() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "balance-config-"));
  const fileName = "balance.xlsx";
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Звіт залишків"],
    ["Номенклатура", "Склад", null, "Ціна"],
    [null, "Вільний залишок", "Резерв", null],
    [null, "В од. зберігання", null, null],
    ["Група", 12, 2, 100],
    ["Товар", 5, 1, 20],
  ]);
  worksheet["!merges"] = [
    XLSX.utils.decode_range("A2:A4"),
    XLSX.utils.decode_range("B2:C2"),
    XLSX.utils.decode_range("D2:D4"),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Залишки");
  XLSX.writeFile(workbook, path.join(directory, fileName));
  return { directory, fileName };
}

test("inspects configured header/data rows and returns preview", async (t) => {
  const { directory, fileName } = await createWorkbook();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const result = await inspectBalanceWorkbook({
    importDir: directory,
    fileName,
    headerRow: 2,
    headerEndRow: 4,
    dataStartRow: 5,
  });

  assert.equal(result.sheetName, "Залишки");
  assert.deepEqual(result.headers.map((column) => column.sourceHeader), [
    "Номенклатура",
    "Склад / Вільний залишок / В од. зберігання",
    "Склад / Резерв",
    "Ціна",
  ]);
  assert.equal(result.headerEndRow, 4);
  assert.equal(result.headers[1].suggestedTitle, "В од. зберігання");
  assert.equal(result.previewRows[0].cells["column-3"], 100);
});

test("normalizes ordered columns and optional price target", () => {
  const config = normalizeBalanceColumnConfig({
    columns: [
      { id: "column-3", sourceIndex: 3, sourceHeader: "Резерв", title: "Резерв" },
      { id: "column-0", sourceIndex: 0, sourceHeader: "Номенклатура", title: "Товар", role: "hierarchy" },
    ],
    priceColumnId: "column-3",
  });

  assert.equal(config.columns[0].sourceHeader, "Резерв");
  assert.equal(config.columns[1].role, "hierarchy");
  assert.equal(config.priceColumnId, "column-3");
});

test("rejects a changed header explicitly", async (t) => {
  const { directory, fileName } = await createWorkbook();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await assert.rejects(
    validateBalanceWorkbookConfiguration({
      importDir: directory,
      fileName,
      headerRow: 2,
      headerEndRow: 4,
      dataStartRow: 5,
      columnConfig: normalizeBalanceColumnConfig({
        columns: [{
          id: "column-0",
          sourceIndex: 0,
          sourceHeader: "Інша назва",
          title: "Товар",
          role: "hierarchy",
        }],
      }),
    }),
    (error) => error?.status === 400 && /Структура XLSX змінилася/.test(error?.error),
  );
});

test("keeps one-row header configuration backward compatible", async (t) => {
  const { directory, fileName } = await createWorkbook();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const result = await inspectBalanceWorkbook({
    importDir: directory,
    fileName,
    headerRow: 3,
    dataStartRow: 5,
  });

  assert.equal(result.headerEndRow, 3);
  assert.deepEqual(result.headers.map((column) => column.sourceHeader), [
    "Номенклатура", "Вільний залишок", "Резерв", "Ціна",
  ]);
});
