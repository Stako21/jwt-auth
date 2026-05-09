import pool from "../db.cjs";
import { getCityById, getUserBranchId } from "../services/appConfig.service.js";

async function ensureCityInBranch(cityId, branchId) {
  const city = await getCityById(cityId);
  return city && Number(city.branchId) === Number(branchId);
}

export async function getRegionNotifications(req, res) {
  try {
    const branchId = getUserBranchId(req.user);
    const [rows] = await pool.query(`
      SELECT id, city, email, rocket_channel, is_active
      FROM region_notifications
      WHERE branch_id = ?
      ORDER BY city, email
    `, [branchId]);

    res.json(rows);
  } catch (error) {
    console.error("Error fetching region notifications:", error);
    res.status(500).json({ error: "Failed to fetch region notifications" });
  }
}

export async function createRegionNotification(req, res) {
  try {
    const { city, email, rocket_channel, is_active } = req.body;
    const branchId = getUserBranchId(req.user);

    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    if (!(await ensureCityInBranch(city, branchId))) {
      return res.status(400).json({ error: "City does not belong to current branch" });
    }

    await pool.query(
      `
      INSERT INTO region_notifications (city, email, rocket_channel, is_active, branch_id)
      VALUES (?, ?, ?, ?, ?)
      `,
      [city, email || null, rocket_channel || null, is_active ? 1 : 0, branchId],
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
    const branchId = getUserBranchId(req.user);

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    if (!(await ensureCityInBranch(city, branchId))) {
      return res.status(400).json({ error: "City does not belong to current branch" });
    }

    const [result] = await pool.query(
      `
      UPDATE region_notifications
      SET city = ?, email = ?, rocket_channel = ?, is_active = ?
      WHERE id = ?
        AND branch_id = ?
      `,
      [city, email || null, rocket_channel || null, is_active ? 1 : 0, id, branchId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating region notification:", error);
    res.status(500).json({ error: "Failed to update region notification" });
  }
}

export async function deleteRegionNotification(req, res) {
  try {
    const { id } = req.params;
    const branchId = getUserBranchId(req.user);

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    const [result] = await pool.query(
      `
      DELETE FROM region_notifications
      WHERE id = ?
        AND branch_id = ?
      `,
      [id, branchId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting region notification:", error);
    res.status(500).json({ error: "Failed to delete region notification" });
  }
}
