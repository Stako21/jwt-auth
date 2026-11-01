import pool from "../db.cjs";
import { getCityById, getBranchById, getUserBranchId } from "./appConfig.service.js";
import { DOCUMENT_GROUPS, TRO_EVENTS, NotificationSettingsError, normalizeNotificationSettings, normalizeNotificationDestination, readNotificationPolicy } from "./notificationPolicy.js";
import { sendTextEmail, sendTextRocket } from "./notificationTransports.js";

export const notificationOptions = {
  document_groups: DOCUMENT_GROUPS, tro_events: TRO_EVENTS,
  defaults: { document_groups: DOCUMENT_GROUPS.map((item) => item.value), tro_events: TRO_EVENTS.map((item) => item.value) },
};

function assertManager(user) {
  if (![1, 2].includes(Number(user?.role))) throw new NotificationSettingsError(403, "Недостатньо прав", "FORBIDDEN");
}
function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NotificationSettingsError(422, "Некоректний ID");
  return id;
}

export function createRegionNotificationsService({ db = pool, getCity = getCityById } = {}) {
  async function cityInBranch(cityId, branchId) {
    const city = await getCity(cityId);
    if (!city || Number(city.branchId) !== Number(branchId)) throw new NotificationSettingsError(403, "Місто недоступне в поточній філії", "CITY_ACCESS_DENIED");
  }
  return {
    async list(user) {
      assertManager(user);
      const [rows] = await db.query(
        `SELECT id, city, email, rocket_channel, is_active, document_groups, tro_events
         FROM region_notifications WHERE branch_id = ? ORDER BY city, email`, [getUserBranchId(user)],
      );
      return rows.map((row) => ({ ...row, is_active: Boolean(Number(row.is_active)), ...readNotificationPolicy(row) }));
    },
    async save(user, payload, id = null) {
      assertManager(user);
      const values = normalizeNotificationSettings(payload);
      const branchId = getUserBranchId(user);
      await cityInBranch(values.city, branchId);
      const params = [values.city, values.email, values.rocket_channel, Number(values.is_active), JSON.stringify(values.document_groups), JSON.stringify(values.tro_events)];
      if (id !== null) {
        const [result] = await db.query(
          `UPDATE region_notifications SET city = ?, email = ?, rocket_channel = ?, is_active = ?,
           document_groups = ?, tro_events = ? WHERE id = ? AND branch_id = ?`, [...params, positiveId(id), branchId],
        );
        if (!result.affectedRows) throw new NotificationSettingsError(404, "Налаштування не знайдено", "NOT_FOUND");
      } else {
        await db.query(
          `INSERT INTO region_notifications (city, email, rocket_channel, is_active, document_groups, tro_events, branch_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`, [...params, branchId],
        );
      }
      return { success: true };
    },
    async remove(user, id) {
      assertManager(user);
      const [result] = await db.query("DELETE FROM region_notifications WHERE id = ? AND branch_id = ?", [positiveId(id), getUserBranchId(user)]);
      if (!result.affectedRows) throw new NotificationSettingsError(404, "Налаштування не знайдено", "NOT_FOUND");
      return { success: true };
    },
  };
}

export function createNotificationTestService({
  getCity = getCityById, getBranch = getBranchById, sendEmail = sendTextEmail, sendRocket = sendTextRocket,
  now = Date.now, logger = (entry) => console.info(JSON.stringify(entry)), cooldownMs = 30000,
} = {}) {
  const requests = new Map();
  return async (user, payload) => {
    assertManager(user);
    const destination = normalizeNotificationDestination(payload);
    if (Object.keys(payload).some((key) => !["city", "email", "rocket_channel"].includes(key))) throw new NotificationSettingsError(422, "Тест приймає лише місто, email та Rocket.Chat канал");
    const branchId = getUserBranchId(user);
    const city = await getCity(destination.city);
    if (!city || Number(city.branchId) !== branchId) throw new NotificationSettingsError(403, "Місто недоступне в поточній філії", "CITY_ACCESS_DENIED");
    const key = `${positiveId(user.id)}:${branchId}`;
    const timestamp = now();
    for (const [requestKey, request] of requests) if (!request.running && timestamp - request.startedAt >= cooldownMs) requests.delete(requestKey);
    const previous = requests.get(key);
    if (previous && (previous.running || timestamp - previous.startedAt < cooldownMs)) throw new NotificationSettingsError(429, "Зачекайте 30 секунд перед повторним тестом", "TEST_RATE_LIMIT");
    if (requests.size >= 2000) throw new NotificationSettingsError(429, "Забагато тестових запитів. Спробуйте пізніше", "TEST_RATE_LIMIT");
    requests.set(key, { running: true, startedAt: timestamp });
    try {
      const branch = await getBranch(branchId);
      const login = String(user.userName || user.login || user.NAME || user.id).replace(/[\r\n]/g, " ").slice(0, 100);
      const text = ["Тестове повідомлення з порталу", `Філія: ${branch?.name || branchId}`, `Місто: ${city.name}`,
        `Час: ${new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "medium" }).format(new Date(timestamp))}`, `Ініціатор: ${login}`].join("\n");
      const results = { email: null, rocket: null };
      const deliver = async (channel, target, send) => {
        let success = true;
        try { await send(); } catch { success = false; }
        results[channel] = { success, message: success ? "Надіслано" : (channel === "email"
          ? "Не вдалося надіслати email. Перевірте адресу та налаштування SMTP."
          : "Не вдалося надіслати повідомлення. Перевірте Rocket.Chat канал і налаштування підключення.") };
        const maskedTarget = channel === "email" ? `${target[0]}***@***` : "#***";
        try { logger({ event: "notification_test", userId: Number(user.id), branchId, cityId: destination.city, channel, target: maskedTarget, success }); } catch { /* Do not retry a delivered message because logging failed. */ }
      };
      await Promise.all([
        destination.email ? deliver("email", destination.email, () => sendEmail({ to: [destination.email], subject: "Тестове повідомлення з порталу", text })) : null,
        destination.rocket_channel ? deliver("rocket", destination.rocket_channel, () => sendRocket(destination.rocket_channel, text)) : null,
      ]);
      return results;
    } finally { requests.set(key, { running: false, startedAt: timestamp }); }
  };
}

export const regionNotificationsService = createRegionNotificationsService();
export const testRegionNotification = createNotificationTestService();
