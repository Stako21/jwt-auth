import test from "node:test";
import assert from "node:assert/strict";
import {
  getOneCStageLabel,
  getOneCStagePresentation,
} from "../../client/src/components/Documents/oneCStage.js";
import {
  buildTroRegistryRows,
  getDocumentRegistryColumnOptions,
  getOneCStageRegistryLabel,
} from "../services/documentRegistry.service.js";

test("TRO one_c_stage uses the shared Ukrainian presentation mapping", () => {
  assert.equal(getOneCStageLabel("NEW"), "Новий");
  assert.equal(getOneCStageLabel("IN_PROGRESS"), "Виконується");
  assert.equal(getOneCStageLabel("COMPLETED"), "Завершено");
  assert.equal(getOneCStageLabel("CANCELLED"), "Скасовано");
  assert.equal(getOneCStageLabel(null), "—");
});

test("TRO one_c_stage presentation keeps canonical stage separate from its label", () => {
  assert.deepEqual(getOneCStagePresentation(" completed "), {
    value: "COMPLETED",
    label: "Завершено",
    tone: "completed",
    icon: "fa-circle-check",
  });
  assert.deepEqual(getOneCStagePresentation(undefined), {
    value: null,
    label: "—",
    tone: "empty",
    icon: "fa-minus",
  });
});

test("TRO print and XLSX registry exposes the 1C stage as a default column", () => {
  const options = getDocumentRegistryColumnOptions("tro");
  const stageColumn = options.columns.find((column) => column.key === "oneCStage");

  assert.deepEqual(stageColumn, {
    key: "oneCStage",
    label: "Стан в УП",
    defaultSelected: true,
  });
  assert.equal(getOneCStageRegistryLabel("NEW"), "Новий");
  assert.equal(getOneCStageRegistryLabel("IN_PROGRESS"), "Виконується");
  assert.equal(getOneCStageRegistryLabel("COMPLETED"), "Завершено");
  assert.equal(getOneCStageRegistryLabel("CANCELLED"), "Скасовано");
  assert.equal(getOneCStageRegistryLabel(null), "—");

  const [row] = buildTroRegistryRows({
    status: "PLANNED",
    tro: { movementType: "INSTALL", oneCStage: "COMPLETED" },
    items: [{ productName: "Тестове ТРО", quantity: 1 }],
  });
  assert.equal(row.status, "Заплановано");
  assert.equal(row.oneCStage, "Завершено");
});
