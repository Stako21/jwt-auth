import { ref } from "yup";
import pool from "../db.cjs";

class RefreshSessionRepository {
  static async getRefreshSession(refreshToken) {
    const [response] = await pool.query(
      "SELECT * FROM refresh_sessions WHERE refresh_token = ?",
      [refreshToken]
    )

    // console.log("!!!!!!!!!!!!response!!!!!!!!!!!");
    // console.log(response);

    if (!response.length) {
      return null;
    }

    // console.log("!!!!!!!!!!!!response[0]!!!!!!!!!!!");
    // console.log(response[0]);

    return response[0]
  }

  static async createRefreshSession({ id, refreshToken, fingerprint }) {
    try {
      const result = await pool.query("INSERT INTO refresh_sessions (user_id, refresh_token, finger_print) VALUES (?, ?, ?)",
        [id, refreshToken, fingerprint.hash]);
      // console.log("Refresh session inserted:", result.rows[0]);
      // console.log("Refresh session inserted:", result);
      console.log("Refresh session inserted:", result[0]);
    } catch (error) {
      console.error("Error inserting refresh session:", error);
    }
  }

  static async deleteRefreshSession(refreshToken) { 
    await pool.query("DELETE FROM refresh_sessions WHERE refresh_token = ?", [refreshToken])
  }
}

export default RefreshSessionRepository;
