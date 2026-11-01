import { regionNotificationsService, testRegionNotification, notificationOptions } from "../services/regionNotifications.service.js";

function handle(operation, successStatus = 200) {
  return async (req, res) => {
    try { res.status(successStatus).json(await operation(req)); } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        return res.status(503).json({ error: "Потрібно застосувати міграцію 032_notification_event_settings.js", code: "NOTIFICATION_MIGRATION_REQUIRED" });
      }
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status === 500) console.error("Region notifications operation failed");
      res.status(status).json({ error: status === 500 ? "Помилка обробки налаштувань сповіщень" : error.message, code: error.code || "NOTIFICATION_ERROR" });
    }
  };
}

export const getRegionNotifications = handle((req) => regionNotificationsService.list(req.user));
export const createRegionNotification = handle((req) => regionNotificationsService.save(req.user, req.body), 201);
export const updateRegionNotification = handle((req) => regionNotificationsService.save(req.user, req.body, req.params.id));
export const deleteRegionNotification = handle((req) => regionNotificationsService.remove(req.user, req.params.id));
export const sendTestNotification = handle((req) => testRegionNotification(req.user, req.body));
export const getNotificationOptions = (_req, res) => res.json(notificationOptions);
