import test from "node:test";
import assert from "node:assert/strict";
import { filterDocuments, getDocumentCityOptions } from "../../client/src/utils/documentFilters.js";

const FILTERS = { statuses: [], contractor: "", authorId: "", documentQuery: "" };
const DOCUMENTS = [{
  id: 1,
  document_number: "ТРО-КР-000013",
  tro_execution_document_numbers: "КР0005001||КР0005002",
  tro_up_document_number: "КР0004952",
}];

test("TRO document search covers Portal, execution and parent UP numbers", () => {
  for (const documentQuery of ["000013", "КР0005002", "0004952"]) {
    assert.equal(filterDocuments(DOCUMENTS, { ...FILTERS, documentQuery }).length, 1);
  }
  assert.equal(filterDocuments(DOCUMENTS, { ...FILTERS, documentQuery: "missing" }).length, 0);
});

test("city filter matches city IDs and composes with status, author and document search", () => {
  const rows = [
    { ...DOCUMENTS[0], id: 1, city_id: 3, status: "PLANNED", author_user_id: 10 },
    { ...DOCUMENTS[0], id: 2, city_id: 4, status: "PLANNED", author_user_id: 10 },
    { ...DOCUMENTS[0], id: 3, city_id: 3, status: "CANCELLED", author_user_id: 10 },
    { ...DOCUMENTS[0], id: 4, city_id: 3, status: "PLANNED", author_user_id: 11 },
  ];
  assert.deepEqual(filterDocuments(rows, { ...FILTERS, cityId: "3" }).map((row) => row.id), [1, 3, 4]);
  assert.deepEqual(filterDocuments(rows, {
    ...FILTERS, cityId: "3", statuses: ["PLANNED"], authorId: "10", documentQuery: "000013",
  }).map((row) => row.id), [1]);
  assert.deepEqual(filterDocuments(rows, { ...FILTERS, cityId: "" }), rows);
  assert.equal(filterDocuments(rows, { ...FILTERS, cityId: "999" }).length, 0);
});

test("city options deduplicate IDs and distinguish names shared by different branches", () => {
  const rows = [
    { city_id: 3, city_name: "Київ", branch_short_name: "Центр" },
    { city_id: "3", city_name: "Київ", branch_short_name: "Центр" },
    { city_id: 4, city_name: "Київ", branch_short_name: "Захід" },
    { city_id: 5, city_name: "Дніпро", branch_short_name: "Схід" },
    { city_id: null, city_name: null },
  ];
  assert.deepEqual(getDocumentCityOptions(rows), [
    { id: "5", name: "Дніпро" },
    { id: "4", name: "Київ (Захід)" },
    { id: "3", name: "Київ (Центр)" },
  ]);
});
