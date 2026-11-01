import { LEGACY_GROUPS, LEGACY_TRO_EVENTS } from "../services/notificationPolicy.js";

export async function up(pool) {
  for (const name of ["document_groups", "tro_events"]) {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'region_notifications' AND column_name = ?`,
      [name],
    );
    if (!rows.length) await pool.query(`ALTER TABLE region_notifications ADD COLUMN ${name} JSON NULL`);
  }
  await pool.query("UPDATE region_notifications SET document_groups = ? WHERE document_groups IS NULL", [JSON.stringify(LEGACY_GROUPS)]);
  await pool.query("UPDATE region_notifications SET tro_events = ? WHERE tro_events IS NULL", [JSON.stringify(LEGACY_TRO_EVENTS)]);
}
