import ReportsRepository from "../repositories/Reports.js";
import ErrorsUtils from "../utils/Errors.js";

class ReportsController {
  static async getSalesReport(req, res) {
    try {
      const { id, role } = req.user;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "date is required" });
      }

      const rows = await ReportsRepository.getSalesReport({
        userId: id,
        role,
        reportDate: date,
      });

      const lastUpdate = await ReportsRepository.getLastImportDate();

      return res.json({
        meta: {
          date,
          rows: rows.length,
          lastUpdate,
        },
        data: rows,
      });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getReportDateRange(req, res) {
    const range = await ReportsRepository.getReportDateRange();
    
    return res.json({ data: range });
  }
}

export default ReportsController;