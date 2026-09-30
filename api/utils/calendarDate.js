const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BUSINESS_TIME_ZONE = "Europe/Kyiv";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isValidCalendarDate(value) {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return false;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function formatDateInBusinessTimeZone(date) {
  const parts = businessDateFormatter.formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function normalizeCalendarDateInput(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const normalized = String(value).trim();
  if (!isValidCalendarDate(normalized)) {
    throw new Error(`Некоректна календарна дата: ${normalized}`);
  }
  return normalized;
}

export function serializeCalendarDate(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const normalized = value.trim();
    if (isValidCalendarDate(normalized)) return normalized;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Некоректна календарна дата: ${value}`);
  }
  return formatDateInBusinessTimeZone(date);
}
