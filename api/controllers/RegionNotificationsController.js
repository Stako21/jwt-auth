import pool from "../db.cjs";

export async function getRegionNotifications(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, city, email, rocket_channel, is_active
      FROM region_notifications
      ORDER BY city, email
    `);

    res.json(rows);
  } catch (error) {
    console.error("Error fetching region notifications:", error);
    res.status(500).json({ error: "Failed to fetch region notifications" });
  }
}

export async function createRegionNotification(req, res) {
  try {
    const { city, email, rocket_channel, is_active } = req.body;

    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    await pool.query(
      `
      INSERT INTO region_notifications (city, email, rocket_channel, is_active)
      VALUES (?, ?, ?, ?)
      `,
      [city, email || null, rocket_channel || null, is_active ? 1 : 0],
    );

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating region notification:", error);
    res.status(500).json({ error: "Failed to create region notification" });
  }
}

export async function updateRegionNotification(req, res) {
  try {
    const { id } = req.params;
    const { city, email, rocket_channel, is_active } = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    await pool.query(
      `
      UPDATE region_notifications
      SET city = ?, email = ?, rocket_channel = ?, is_active = ?
      WHERE id = ?
      `,
      [city, email || null, rocket_channel || null, is_active ? 1 : 0, id],
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating region notification:", error);
    res.status(500).json({ error: "Failed to update region notification" });
  }
}

export async function deleteRegionNotification(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    await pool.query(
      `
      DELETE FROM region_notifications
      WHERE id = ?
      `,
      [id],
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting region notification:", error);
    res.status(500).json({ error: "Failed to delete region notification" });
  }
}
