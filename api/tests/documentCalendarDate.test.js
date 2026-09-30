import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCalendarDateInput,
  serializeCalendarDate,
} from "../utils/calendarDate.js";
import {
  formatCalendarDate,
  toCalendarDateInput,
} from "../../client/src/utils/calendarDate.js";
import { formatPdfDate } from "../pdf/dateFormatters.js";
import {
  normalizeDocumentItemDates,
  serializeDocumentItemDate,
} from "../services/DocumentService.js";

test("MySQL DATE objects serialize as Kyiv calendar dates without UTC day shift", () => {
  const mysqlDate = new Date("2027-09-23T21:00:00.000Z");
  assert.equal(serializeCalendarDate(mysqlDate), "2027-09-24");
});

test("frontend normalizes legacy ISO DTO values in the business timezone", () => {
  assert.equal(
    toCalendarDateInput("2027-09-23T21:00:00.000Z"),
    "2027-09-24",
  );
  assert.equal(formatCalendarDate("2027-09-24"), "24.09.2027");
});

test("calendar input accepts shelf lives longer than one year", () => {
  assert.equal(normalizeCalendarDateInput("2025-08-05"), "2025-08-05");
  assert.equal(normalizeCalendarDateInput("2029-08-05"), "2029-08-05");
  assert.ok("2025-08-05" < "2029-08-05");
  assert.deepEqual(
    normalizeDocumentItemDates("2025-08-05", "2029-08-05", "TAKE"),
    {
      manufactureDate: "2025-08-05",
      expiryDate: "2029-08-05",
    },
  );
});

test("document item dates enforce order but not an artificial one-year limit", () => {
  assert.throws(
    () => normalizeDocumentItemDates("2027-01-01", "2026-12-31", "TAKE"),
    /Дата виготовлення не може бути пізніше/,
  );
  assert.deepEqual(normalizeDocumentItemDates("", "", "GIVE"), {
    manufactureDate: "1000-01-01",
    expiryDate: "1000-01-01",
  });
  assert.equal(serializeDocumentItemDate("1000-01-01", "GIVE"), null);
});

test("calendar validation handles leap years and rejects impossible dates", () => {
  assert.equal(normalizeCalendarDateInput("2028-02-29"), "2028-02-29");
  assert.throws(
    () => normalizeCalendarDateInput("2027-02-29"),
    /Некоректна календарна дата/,
  );
});

test("API, modal and PDF retain the same calendar day", () => {
  const value = serializeCalendarDate(new Date("2027-09-23T21:00:00.000Z"));
  assert.equal(toCalendarDateInput(value), "2027-09-24");
  assert.equal(formatCalendarDate(value), "24.09.2027");
  assert.equal(formatPdfDate(value), "24.09.2027");
});
