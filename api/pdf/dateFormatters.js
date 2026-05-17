const PDF_TIME_ZONE = "Europe/Kyiv";

const pdfDateFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: PDF_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const pdfDateTimeFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: PDF_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      const [year, month, day] = trimmedValue.split("-").map(Number);

      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  const normalizedDate = new Date(value);

  return Number.isNaN(normalizedDate.getTime()) ? null : normalizedDate;
}

export function formatPdfDate(value) {
  const normalizedDate = normalizeDateValue(value);

  return normalizedDate ? pdfDateFormatter.format(normalizedDate) : "";
}

export function formatPdfDateTime(value) {
  const normalizedDate = normalizeDateValue(value);

  return normalizedDate ? pdfDateTimeFormatter.format(normalizedDate) : "";
}
