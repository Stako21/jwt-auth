import { Router } from "express";
import pool from "../db.js";
import { roleName } from "../utils/roles.js";

const router = Router();

// GET /users — добавляем роль в человекочитаемом виде
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, role, email, ... FROM users"
    );
    const users = rows.map((u) => ({ ...u, role_name: roleName(u.role) }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// POST /users — сохраняем role как число
router.post("/", async (req, res) => {
  try {
    const role = Number(req.body.role) || 3; // fallback на user/NTO если нужно
    // ...хеш пароля и т.д...
    await pool.query("INSERT INTO users (name, email, role) VALUES (?, ?, ?)", [
      name,
      email,
      role,
    ]);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT /users/:id аналогично — приводим role к number при обновлении

export default router;
