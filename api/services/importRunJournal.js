const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 5;

const sensitiveKeyPattern =
  /(password|passwd|secret|token|authorization|cookie|session|stack|sql|query)/i;
const pathKeys = new Set([
  "file",
  "path",
  "filename",
  "sourcefile",
  "source_file",
  "filepath",
  "file_path",
]);

let sequence = 0;
let entries = [];

function trimString(value) {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…`
    : value;
}

function safeFileName(value) {
  return String(value).split(/[\\/]/).filter(Boolean).pop() || "";
}

function sanitizeMessage(value) {
  return trimString(String(value || ""))
    .replace(/[A-Za-z]:\\(?:[^\\\s]+\\)+[^\\\s]+/g, safeFileName)
    .replace(/\/(?:[^/\s]+\/)+[^/\s]+/g, safeFileName)
    .replace(
      /(password|passwd|secret|token|authorization)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    );
}

function sanitizeValue(value, key = "", depth = 0) {
  if (sensitiveKeyPattern.test(key)) {
    return undefined;
  }

  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "boolean" || typeof value === "number") return value;

  if (typeof value === "string") {
    return trimString(pathKeys.has(key.toLowerCase()) ? safeFileName(value) : value);
  }

  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[details truncated]";

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, "", depth + 1));
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .slice(0, MAX_OBJECT_KEYS)
      .reduce((result, [childKey, childValue]) => {
        const sanitized = sanitizeValue(childValue, childKey, depth + 1);
        if (sanitized !== undefined) result[childKey] = sanitized;
        return result;
      }, {});
  }

  return trimString(String(value));
}

function toIsoTimestamp(value, fallback) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function prune(now = new Date()) {
  const threshold = now.getTime() - RETENTION_MS;
  entries = entries
    .filter((entry) => new Date(entry.finished_at).getTime() >= threshold)
    .slice(0, MAX_ENTRIES);
}

export function recordImportRun({
  task,
  label,
  branch,
  trigger,
  result,
  startedAt,
  finishedAt,
}) {
  const finished = finishedAt instanceof Date ? finishedAt : new Date(finishedAt || Date.now());
  const started = startedAt instanceof Date ? startedAt : new Date(startedAt || finished);
  const safeFinishedAt = toIsoTimestamp(finished, new Date());
  const safeStartedAt = toIsoTimestamp(started, new Date(safeFinishedAt));
  const durationMs = Math.max(
    0,
    new Date(safeFinishedAt).getTime() - new Date(safeStartedAt).getTime(),
  );

  sequence += 1;
  entries.unshift({
    id: `${new Date(safeFinishedAt).getTime()}-${sequence}`,
    task,
    label: label || task,
    branch: branch
      ? {
          id: Number(branch.id),
          slug: branch.slug || "",
          name: branch.name || "",
          short_name: branch.shortName || branch.short_name || "",
        }
      : null,
    trigger: trigger || "scheduled",
    status: result?.status || "failed",
    code: result?.code || null,
    message: sanitizeMessage(result?.message),
    details: sanitizeValue(result?.details || {}),
    started_at: safeStartedAt,
    finished_at: safeFinishedAt,
    duration_ms: durationMs,
  });

  prune(finished);
}

export function listImportRuns({ task, status, limit = 100, now = new Date() } = {}) {
  prune(now);
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const filtered = entries.filter(
    (entry) =>
      (!task || entry.task === task) && (!status || entry.status === status),
  );

  return {
    data: filtered.slice(0, normalizedLimit),
    available: filtered.length,
    retentionDays: RETENTION_MS / (24 * 60 * 60 * 1000),
    maxEntries: MAX_ENTRIES,
  };
}

export function clearImportRunJournalForTests() {
  entries = [];
  sequence = 0;
}
