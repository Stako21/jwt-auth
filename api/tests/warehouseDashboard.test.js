import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWarehouseRanking,
  createWarehouseDashboardService,
  getCurrentShiftReportDate,
} from "../services/WarehouseDashboardService.js";

test("warehouse dashboard uses the 08:00 Kyiv shift boundary", () => {
  assert.equal(
    getCurrentShiftReportDate(new Date("2026-09-21T04:59:59Z")),
    "2026-09-20",
  );
  assert.equal(
    getCurrentShiftReportDate(new Date("2026-09-21T05:00:00Z")),
    "2026-09-21",
  );
});

test("ranking is primarily by invoices and gives equal invoice totals equal rank", () => {
  const ranking = buildWarehouseRanking([
    { pickerGuid: "b", picker: "Другий", documentsCount: 8, rowsCount: 90, weight: 200 },
    { pickerGuid: "a", picker: "Перший", documentsCount: 10, rowsCount: 80, weight: 180 },
    { pickerGuid: "c", picker: "Третій", documentsCount: 8, rowsCount: 100, weight: 150 },
    { pickerGuid: "d", picker: "Четвертий", documentsCount: 5, rowsCount: 50, weight: 100 },
  ]);
  assert.deepEqual(
    ranking.map((row) => [row.pickerGuid, row.rank]),
    [["a", 1], ["c", 2], ["b", 2], ["d", 4]],
  );
});

test("dashboard response is warehouse-scoped and never exposes earnings or rates", async () => {
  const repository = {
    async getAllowedWarehouses() {
      return [
        { id: 4, warehouseGuid: "warehouse-a", warehouseName: "Склад А" },
        { id: 5, warehouseGuid: "warehouse-b", warehouseName: "Склад Б" },
      ];
    },
    async getShiftRows(_branchId, warehouseGuid, reportDate) {
      assert.equal(warehouseGuid, "warehouse-b");
      assert.equal(reportDate, "2026-09-21");
      return {
        dataUpdatedAt: "2026-09-21T09:00:00Z",
        rows: [
          { pickerGuid: "picker-1", picker: "Працівник", documentsCount: 12, rowsCount: 140, weight: 320.5 },
        ],
      };
    },
  };
  const result = await createWarehouseDashboardService(repository).getDashboard({
    userId: 7,
    branchId: 1,
    warehouseId: 5,
    now: new Date("2026-09-21T10:00:00Z"),
  });
  assert.equal(result.warehouse.id, 5);
  assert.equal(result.ranking[0].documentsCount, 12);
  assert.equal(result.summary.weight, 320.5);
  const keys = [];
  JSON.stringify(result, (key, value) => {
    if (key) keys.push(key.toLowerCase());
    return value;
  });
  assert.equal(keys.some((key) => key.includes("earning")), false);
  assert.equal(keys.some((key) => key.includes("rate") && key !== "generatedat"), false);
  assert.equal(keys.some((key) => key.includes("amount")), false);
});
