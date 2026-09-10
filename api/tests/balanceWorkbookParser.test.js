import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { parseBalanceWorkbookData } from "../../client/src/utils/balanceWorkbookParser.js";

test("uses XLSX outline levels for numeric group names and keeps configured Price as popover data", () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Номенклатура", "Залишок", "Ціна"],
    ["КАРАМЕЛЬ 200/300", 16249, 75.58],
    ["Beri РЦ 180г /12шт", 1, 27.97],
  ]);
  worksheet["!rows"] = [{ level: 0 }, { level: 2 }, { level: 3 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Залишки");
  const data = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const result = parseBalanceWorkbookData(data, {
    headerRow: 1,
    headerEndRow: 1,
    dataStartRow: 2,
    priceMultiplierPercent: 10,
    columnConfig: {
      version: 1,
      columns: [
        {
          id: "column-0",
          sourceIndex: 0,
          sourceHeader: "Номенклатура",
          title: "Номенклатура",
          role: "hierarchy",
        },
        {
          id: "column-1",
          sourceIndex: 1,
          sourceHeader: "Залишок",
          title: "Залишок",
          role: "value",
        },
        {
          id: "column-2",
          sourceIndex: 2,
          sourceHeader: "Ціна",
          title: "Ціна",
          role: "value",
        },
      ],
      priceColumnId: "column-2",
    },
  });

  assert.equal(result.hierarchy[0].productNameCell, "КАРАМЕЛЬ 200/300");
  assert.equal(result.hierarchy[0].children.length, 1);
  assert.equal(result.hierarchy[0].children[0].productNameCell, "Beri РЦ 180г /12шт");
  assert.equal(result.hierarchy[0].children[0].priceCell, 27.97);
  assert.ok(Math.abs(result.hierarchy[0].children[0].adjustedPriceCell - 30.767) < 1e-9);
  assert.equal(result.columns.find((column) => column.id === "column-2")?.isPrice, true);
});
