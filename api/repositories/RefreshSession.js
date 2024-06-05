import { ref } from "yup";
import pool from "../db.cjs";

class RefreshSessionRepository {
  static async getRefreshSession(refreshToken) { }

  static async createRefreshSession({ id, refreshToken, fingerprint }) {
    // /console.log([id, refreshToken, fingerprint.hash]);
    // await pool.query("INSERT INTO refresh_sessions (user_id, refresh_token, finger_print) VALUES ($1, $2, $3)",
    // [id, refreshToken, fingerprint.hash]);

    try {
      const result = await pool.query("INSERT INTO refresh_sessions (user_id, refresh_token, finger_print) VALUES ($1, $2, $3)",
        [id, refreshToken, fingerprint.hash]);
      console.log("Refresh session inserted:", result.rows[0]);
    } catch (error) {
      console.error("Error inserting refresh session:", error);
    }

  }

  static async deleteRefreshSession(refreshToken) { }
}

export default RefreshSessionRepository;
