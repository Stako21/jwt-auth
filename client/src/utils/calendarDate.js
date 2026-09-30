const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const BUSINESS_TIME_ZONE = "Europe/Kyiv";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDateInBusinessTimeZone(date) {
  const parts = businessDateFormatter.formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function toCalendarDateInput(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const normalized = value.trim();
    if (CALENDAR_DATE_PATTERN.test(normalized)) return normalized;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDateInBusinessTimeZone(date);
}

export function formatCalendarDate(value) {
  const normalized = toCalendarDateInput(value);
  if (!normalized) return "—";

  const [year, month, day] = normalized.split("-");
  return `${day}.${month}.${year}`;
}
