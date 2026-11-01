export const DOCUMENT_GROUPS = Object.freeze([
  { value: "RETURN_EXCHANGE", label: "Повернення/Обмін" },
  { value: "TRO", label: "ТРО" },
]);
export const TRO_EVENTS = Object.freeze([
  { value: "TRO_CREATED", label: "Створення заявки" },
  { value: "TRO_SIGNED", label: "Підписання" },
  { value: "TRO_REVISION", label: "Повернення на доопрацювання" },
  { value: "TRO_REJECTED", label: "Відхилення на порталі" },
  { value: "TRO_PLANNED", label: "Створення документа в УП / Заплановано" },
  { value: "TRO_REJECTED_IN_UP", label: "Відхилення в УП" },
  { value: "TRO_COMPLETED", label: "Підтвердження виконання" },
]);
export const LEGACY_GROUPS = Object.freeze(["RETURN_EXCHANGE", "TRO"]);
export const LEGACY_TRO_EVENTS = Object.freeze([
  "TRO_SIGNED", "TRO_REVISION", "TRO_REJECTED", "TRO_PLANNED", "TRO_REJECTED_IN_UP", "TRO_COMPLETED",
]);

export class NotificationSettingsError extends Error {
  constructor(status, message, code = "INVALID_NOTIFICATION_SETTINGS") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function storedList(value, fallback) {
  if (value === null || value === undefined) return [...fallback];
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

export function readNotificationPolicy(row) {
  return {
    document_groups: storedList(row.document_groups, LEGACY_GROUPS).filter((value) => LEGACY_GROUPS.includes(value)),
    tro_events: storedList(row.tro_events, LEGACY_TRO_EVENTS).filter((value) => TRO_EVENTS.some((item) => item.value === value)),
  };
}

function validList(value, options, label) {
  if (!Array.isArray(value) || value.some((entry) => !options.includes(entry))) {
    throw new NotificationSettingsError(422, `Некоректний список: ${label}`);
  }
  return options.filter((entry) => value.includes(entry));
}

export function normalizeNotificationDestination(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new NotificationSettingsError(422, "Некоректні налаштування");
  const city = Number(payload.city);
  const email = String(payload.email ?? "").trim().toLowerCase();
  const rawChannel = String(payload.rocket_channel ?? "").trim();
  if (!Number.isSafeInteger(city) || city <= 0) throw new NotificationSettingsError(422, "Оберіть місто");
  if (!email && !rawChannel) throw new NotificationSettingsError(422, "Вкажіть email або Rocket.Chat канал");
  if (email && (email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))) {
    throw new NotificationSettingsError(422, "Вкажіть коректну email-адресу");
  }
  if (rawChannel && !/^#?[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u.test(rawChannel)) {
    throw new NotificationSettingsError(422, "Некоректна назва Rocket.Chat каналу");
  }
  return { city, email: email || null, rocket_channel: rawChannel ? `#${rawChannel.replace(/^#/, "")}` : null };
}

export function normalizeNotificationSettings(payload) {
  const destination = normalizeNotificationDestination(payload);
  const active = payload.is_active ?? true;
  if (![true, false, 0, 1].includes(active)) throw new NotificationSettingsError(422, "Некоректний стан активності");
  const document_groups = validList(payload.document_groups, LEGACY_GROUPS, "Типи документів");
  const tro_events = validList(payload.tro_events, TRO_EVENTS.map((item) => item.value), "Події ТРО");
  if (active && !document_groups.length) throw new NotificationSettingsError(422, "Оберіть хоча б одну групу документів");
  if (active && document_groups.includes("TRO") && !tro_events.length) {
    throw new NotificationSettingsError(422, "Оберіть хоча б одну подію ТРО або вимкніть групу ТРО");
  }
  return { ...destination, is_active: Boolean(active), document_groups, tro_events };
}

export function inferTroEvent(oldStatus, newStatus) {
  if (!oldStatus && newStatus === "NEW") return "TRO_CREATED";
  return ({ NOT_COMPLETED: "TRO_SIGNED", REVISION: "TRO_REVISION", PLANNED: "TRO_PLANNED", COMPLETED: "TRO_COMPLETED" })[newStatus]
    || (newStatus === "REJECTED" ? (oldStatus === "NOT_COMPLETED" ? "TRO_REJECTED_IN_UP" : "TRO_REJECTED") : null);
}

export function selectNotificationRecipients(rows, { documentType, eventCode }) {
  const emails = new Set();
  const rocketChannels = new Set();
  for (const row of rows) {
    if (row.is_active !== undefined && !Number(row.is_active)) continue;
    const policy = readNotificationPolicy(row);
    const allowed = documentType === "TRO"
      ? policy.document_groups.includes("TRO") && policy.tro_events.includes(eventCode)
      : ["RETURN", "EXCHANGE"].includes(documentType) && policy.document_groups.includes("RETURN_EXCHANGE");
    if (!allowed) continue;
    if (row.email?.trim()) emails.add(row.email.trim().toLowerCase());
    if (row.rocket_channel?.trim()) rocketChannels.add(`#${row.rocket_channel.trim().replace(/^#/, "")}`);
  }
  return { emails: [...emails], rocketChannels: [...rocketChannels] };
}
