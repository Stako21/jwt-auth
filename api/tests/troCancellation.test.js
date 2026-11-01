import test from "node:test";
import assert from "node:assert/strict";
import { getTroCancellationWarning } from "../../client/src/components/Documents/troCancellation.js";
import { buildTroRegistryRows } from "../services/documentRegistry.service.js";

test("cancellation warning identifies the parent and every remaining active execution in list and modal DTOs", () => {
  const list = getTroCancellationWarning({
    document_type: "TRO", tro_one_c_stage: "CANCELLED", tro_movement_type: "RETURN",
    tro_up_document_number: "ЗВ001", tro_execution_document_numbers: "ПВ002||ПВ003",
  });
  const modal = getTroCancellationWarning({
    documentType: "TRO", tro: {
      oneCStage: "CANCELLED", movementType: "RETURN", upDocumentNumber: "ЗВ001",
      execution_documents: [{ document_number: "ПВ002" }, { document_number: "ПВ003" }],
    },
  });
  assert.deepEqual(list, modal);
  assert.deepEqual(list.executionNumbers, ["ПВ002", "ПВ003"]);
  assert.match(list.message, /ЗВ001/);
  assert.match(list.message, /активні документи повернення: ПВ002, ПВ003/);
  assert.match(list.message, /або відновіть батьківську заявку/);
  assert.match(list.message, /Синхронізація триває/);
});

test("warning clears when the parent is restored or no active executions remain", () => {
  const document = {
    document_type: "TRO", tro_one_c_stage: "CANCELLED", tro_movement_type: "INSTALL",
    tro_execution_document_numbers: "УСТ001",
  };
  assert.match(getTroCancellationWarning(document).message, /встановлення: УСТ001/);
  assert.equal(getTroCancellationWarning({ ...document, tro_one_c_stage: "IN_PROGRESS" }), null);
  assert.equal(getTroCancellationWarning({ ...document, tro_one_c_stage: "NEW" }), null);
  assert.equal(getTroCancellationWarning({ ...document, tro_execution_document_numbers: "" }), null);
  assert.equal(getTroCancellationWarning({ ...document, document_type: "RETURN" }), null);
  assert.equal(getTroCancellationWarning(null), null);
});

test("print and XLSX registries display the distinct cancelled Portal status", () => {
  const [row] = buildTroRegistryRows({
    status: "CANCELLED", tro: { movementType: "INSTALL", oneCStage: "CANCELLED" },
    items: [{ productName: "ТРО", quantity: 1 }],
  });
  assert.equal(row.status, "Скасовано");
});

test("manual Portal cancellation keeps the UP conflict warning without claiming Portal cancellation is pending", () => {
  const warning = getTroCancellationWarning({
    document_type: "TRO", status: "CANCELLED", tro_one_c_stage: "CANCELLED",
    tro_execution_document_numbers: "УП001",
  });
  assert.match(warning.message, /На порталі заявку вже скасовано/);
  assert.match(warning.message, /УП001/);
  assert.doesNotMatch(warning.message, /Для остаточного скасування/);
});
