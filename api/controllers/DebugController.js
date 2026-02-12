import pool from "../db.cjs";

export async function debugUserHierarchy(req, res) {
  try {
    const { userId } = req.params;

    // Получаем информацию о пользователе
    const [[user]] = await pool.query(
      `SELECT id, user_name, role FROM users WHERE id = ?`,
      [userId],
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Получаем прямых подчиненных
    const [directSubordinates] = await pool.query(
      `
      SELECT u.id, u.user_name, u.role
      FROM user_hierarchy uh
      JOIN users u ON u.id = uh.child_user_id
      WHERE uh.parent_user_id = ?
      `,
      [userId],
    );

    // Получаем всех подчиненных рекурсивно
    const [allSubordinates] = await pool.query(
      `
      WITH RECURSIVE subordinates AS (
        SELECT child_user_id
        FROM user_hierarchy
        WHERE parent_user_id = ?

        UNION ALL

        SELECT uh.child_user_id
        FROM user_hierarchy uh
        JOIN subordinates s ON s.child_user_id = uh.parent_user_id
      )
      SELECT u.id, u.user_name, u.role
      FROM subordinates
      JOIN users u ON u.id = subordinates.child_user_id
      `,
      [userId],
    );

    // Получаем документы подчиненных
    const [documents] = await pool.query(
      `
      SELECT d.id, d.document_number, u.user_name, d.document_date, d.status
      FROM documents d
      JOIN users u ON u.id = d.author_user_id
      WHERE d.author_user_id IN (
        WITH RECURSIVE subordinates AS (
          SELECT child_user_id
          FROM user_hierarchy
          WHERE parent_user_id = ?

          UNION ALL

          SELECT uh.child_user_id
          FROM user_hierarchy uh
          JOIN subordinates s ON s.child_user_id = uh.parent_user_id
        )
        SELECT child_user_id FROM subordinates
        UNION ALL
        SELECT ?
      )
      `,
      [userId, userId],
    );

    res.json({
      user,
      directSubordinates,
      allSubordinates,
      documents,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
}
