import pool from "../db.cjs";
import { selectNotificationRecipients } from "./notificationPolicy.js";

export async function loadNotificationRecipients(city, branchId, event, db = pool) {
  let rows;
  try {
    [rows] = await db.query(
      `SELECT email, rocket_channel, document_groups, tro_events FROM region_notifications
       WHERE city = ? AND branch_id = ? AND is_active = 1`, [city, branchId],
    );
  } catch (error) {
    // Preserve legacy delivery during a code-before-schema rollout. Creation stays off.
    if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
    [rows] = await db.query(
      `SELECT email, rocket_channel FROM region_notifications
       WHERE city = ? AND branch_id = ? AND is_active = 1`, [city, branchId],
    );
  }
  return selectNotificationRecipients(rows, event);
}
