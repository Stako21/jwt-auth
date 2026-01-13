import { ref } from "yup";
import pool from "../db.cjs";

class RefreshSessionRepository {
  static async getRefreshSession(refreshToken) {
    const [response] = await pool.query(
      "SELECT rs.* FROM refresh_sessions rs JOIN users u ON u.id = rs.user_id WHERE rs.refresh_token = ? AND u.is_active = 1",
      [refreshToken]
    );

    if (!response.length) {
      return null;
    }
    return response[0];
  }

  static async createRefreshSession({ id, refreshToken, fingerprint }) {
    try {
      const result = await pool.query(
        "INSERT INTO refresh_sessions (user_id, refresh_token, finger_print) VALUES (?, ?, ?)",
        [id, refreshToken, fingerprint.hash]
      );
    } catch (error) {}
  }

  static async deleteRefreshSession(refreshToken) {
    await pool.query("DELETE FROM refresh_sessions WHERE refresh_token = ?", [
      refreshToken,
    ]);
  }
}

export default RefreshSessionRepository;
