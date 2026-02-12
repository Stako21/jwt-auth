import pool from "../db.cjs";

export async function getTradePoints(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        tp.id,
        tp.name,
        tp.address,
        tp.contractor_id,
        c.name AS contractor
      FROM trade_points tp
      JOIN contractors c ON c.id = tp.contractor_id
      WHERE tp.is_active = 1
      ORDER BY tp.name
      `
    );

    res.json(rows);
  } catch (e) {
    console.error("getTradePoints error:", e);
    res.status(500).json({ message: "Failed to load trade points" });
  }
}

export async function getProducts(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.group_id,
        g.name AS group_name
      FROM products p
      JOIN product_groups g ON g.id = p.group_id
      WHERE p.is_active = 1
      ORDER BY g.name, p.name
      `
    );

    res.json(rows);
  } catch (e) {
    console.error("getProducts error:", e);
    res.status(500).json({ message: "Failed to load products" });
  }
}

export async function getContractors(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        name
      FROM contractors
      WHERE is_active = 1
      ORDER BY name
      `
    );

    res.json(rows);
  } catch (e) {
    console.error("getContractors error:", e);
    res.status(500).json({ message: "Failed to load contractors" });
  }
}

export async function getProductGroups(req, res) {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        name
      FROM product_groups
      WHERE is_active = 1
      ORDER BY name
      `
    );

    res.json(rows);
  } catch (e) {
    console.error("getProductGroups error:", e);
    res.status(500).json({ message: "Failed to load product groups" });
  }
}