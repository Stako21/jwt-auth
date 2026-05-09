import fs from "fs/promises";
import path from "path";
import {
  getBalancePageBySlug,
  getImportDir,
} from "../services/appConfig.service.js";

export async function getBalanceFile(req, res) {
  try {
    const { slug } = req.params;
    const page = await getBalancePageBySlug(req.user, slug);

    if (!page) {
      return res.status(404).json({ message: "Balance page not found" });
    }

    const safeFileName = path.basename(page.fileName);
    const filePath = path.resolve(getImportDir(), safeFileName);

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        message: "Файл залишків не знайдено",
        fileName: safeFileName,
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
    );

    return res.sendFile(filePath);
  } catch (error) {
    console.error("getBalanceFile error:", error);
    return res.status(500).json({ message: "Failed to load balance file" });
  }
}
