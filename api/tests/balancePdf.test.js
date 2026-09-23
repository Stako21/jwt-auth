import assert from "node:assert/strict";
import test from "node:test";
import { flattenBalanceRows, renderBalanceHtml } from "../pdf/balance.template.js";

const columns = [
  { id: "name", title: "Номенклатура", role: "hierarchy" },
  { id: "stock", title: "Залишок", role: "value" },
  { id: "price", title: "Ціна", role: "value", isPrice: true },
];
const hierarchy = [{
  productNameCell: "Група",
  configuredValues: { stock: 10, price: 20 },
  children: [{
    productNameCell: "Товар",
    configuredValues: { stock: 4, price: 5 },
    children: [],
  }],
}];

test("balance PDF flattens the hierarchy in configured column order", () => {
  const rows = flattenBalanceRows(hierarchy, columns.filter((column) => !column.isPrice));
  assert.deepEqual(rows.map((row) => row.values), [
    ["Група", 10],
    ["Товар", 4],
  ]);
  assert.deepEqual(rows.map((row) => row.level), [0, 1]);
});

test("balance PDF includes warehouse and actuality but hides configured price column", () => {
  const html = renderBalanceHtml({
    warehouseName: "Запоріжжя",
    actualAt: "23.09.2026 08:00",
    columns,
    hierarchy,
  });

  assert.match(html, /Склад: Запоріжжя/);
  assert.match(html, /Залишок актуальний на: 23\.09\.2026 08:00/);
  assert.match(html, /Номенклатура/);
  assert.match(html, /Залишок/);
  assert.doesNotMatch(html, />Ціна</);
});
