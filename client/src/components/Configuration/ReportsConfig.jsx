import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import {
  fetchReportsConfig,
  setReportConfigActive,
  updateReportConfig,
} from "../../services/config.api";
import { useAppConfig } from "../../context/AppConfigContext";

const defaultForm = {
  reportKey: "",
  route: "",
  menuTitle: "",
  fileName: "",
  sortOrder: 0,
  isActive: true,
};

function normalizeForm(report) {
  if (!report) return defaultForm;

  return {
    reportKey: report.reportKey || "",
    route: report.route || "",
    menuTitle: report.menuTitle || "",
    fileName: report.fileName || "",
    sortOrder: Number(report.sortOrder) || 0,
    isActive: Boolean(report.isActive),
  };
}

export function ReportsConfig() {
  const { appConfig, reloadConfig } = useAppConfig();
  const { enqueueSnackbar } = useSnackbar();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});

  const branch = appConfig?.branch || null;

  const loadReports = async () => {
    setLoading(true);
    try {
      const nextReports = await fetchReportsConfig();
      setReports(nextReports);
    } catch (error) {
      console.error("Failed to load reports config:", error);
      enqueueSnackbar("Не вдалося завантажити звіти", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const sortDiff = Number(a.sortOrder) - Number(b.sortOrder);
      if (sortDiff !== 0) return sortDiff;
      return String(a.menuTitle || "").localeCompare(String(b.menuTitle || ""));
    });
  }, [reports]);

  const validate = () => {
    const nextErrors = {};

    if (!form.route.trim()) nextErrors.route = "Обов'язкове поле";
    else if (!form.route.trim().startsWith("/")) {
      nextErrors.route = "Маршрут має починатися з /";
    }

    if (!form.menuTitle.trim()) nextErrors.menuTitle = "Обов'язкове поле";
    if (!form.fileName.trim()) nextErrors.fileName = "Обов'язкове поле";
    if (!Number.isInteger(Number(form.sortOrder))) {
      nextErrors.sortOrder = "Має бути цілим числом";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setEditingReportId(null);
    setForm(defaultForm);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingReportId) return;
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        reportKey: form.reportKey,
        route: form.route.trim(),
        menuTitle: form.menuTitle.trim(),
        fileName: form.fileName.trim(),
        sortOrder: Number(form.sortOrder),
        isActive: Boolean(form.isActive),
      };

      await updateReportConfig(editingReportId, payload);
      enqueueSnackbar("Налаштування звіту оновлено", { variant: "success" });

      await Promise.all([loadReports(), reloadConfig()]);
    } catch (error) {
      console.error("Failed to save report config:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося зберегти налаштування звіту",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (report) => {
    setSaving(true);
    try {
      await setReportConfigActive(report.id, !report.isActive);
      enqueueSnackbar(
        report.isActive ? "Звіт деактивовано" : "Звіт активовано",
        { variant: "success" },
      );
      await Promise.all([loadReports(), reloadConfig()]);
      if (editingReportId === report.id && report.isActive) {
        setForm((current) => ({ ...current, isActive: false }));
      }
    } catch (error) {
      console.error("Failed to toggle report active:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося змінити статус звіту",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="columns">
        <div className="column is-7">
          <div className="level mb-3">
            <div className="level-left">
              <div>
                <h3 className="title is-5 mb-1">Звіти</h3>
                <p className="is-size-7 has-text-grey">
                  Філія: {branch?.name || "—"}
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <p>Завантаження...</p>
          ) : (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>Ключ</th>
                    <th>Маршрут</th>
                    <th>Назва</th>
                    <th>Файл</th>
                    <th>Порядок</th>
                    <th>Статус</th>
                    <th className="has-text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedReports.map((report) => (
                    <tr key={report.id}>
                      <td>{report.reportKey}</td>
                      <td>{report.route}</td>
                      <td>{report.menuTitle}</td>
                      <td>{report.fileName || "—"}</td>
                      <td>{report.sortOrder}</td>
                      <td>
                        <span
                          className={`tag ${
                            report.isActive ? "is-success" : "is-light"
                          }`}
                        >
                          {report.isActive ? "Активний" : "Неактивний"}
                        </span>
                      </td>
                      <td className="has-text-right">
                        <div className="buttons is-right are-small">
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingReportId(report.id);
                              setForm(normalizeForm(report));
                              setErrors({});
                            }}
                            disabled={saving}
                          >
                            Редагувати
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              report.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(report)}
                            disabled={saving}
                          >
                            {report.isActive ? "Деактивувати" : "Активувати"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedReports.length && (
                    <tr>
                      <td colSpan="7" className="has-text-centered has-text-grey">
                        Звіти ще не налаштовані
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="column is-5">
          <h3 className="title is-5">
            {editingReportId ? "Картка звіту" : "Оберіть звіт"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Ключ</label>
              <div className="control">
                <input className="input" value={form.reportKey} disabled />
              </div>
            </div>

            <div className="field">
              <label className="label">Маршрут *</label>
              <div className="control">
                <input
                  className={`input ${errors.route ? "is-danger" : ""}`}
                  value={form.route}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, route: e.target.value }))
                  }
                  placeholder="/report-romashka"
                  disabled={!editingReportId}
                />
              </div>
              {errors.route && <p className="help is-danger">{errors.route}</p>}
            </div>

            <div className="field">
              <label className="label">Назва в меню *</label>
              <div className="control">
                <input
                  className={`input ${errors.menuTitle ? "is-danger" : ""}`}
                  value={form.menuTitle}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      menuTitle: e.target.value,
                    }))
                  }
                  placeholder="Звіт Ромашка"
                  disabled={!editingReportId}
                />
              </div>
              {errors.menuTitle && (
                <p className="help is-danger">{errors.menuTitle}</p>
              )}
            </div>

            <div className="field">
              <label className="label">Файл *</label>
              <div className="control">
                <input
                  className={`input ${errors.fileName ? "is-danger" : ""}`}
                  value={form.fileName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      fileName: e.target.value,
                    }))
                  }
                  placeholder="report_romashka.json"
                  disabled={!editingReportId}
                />
              </div>
              {errors.fileName && (
                <p className="help is-danger">{errors.fileName}</p>
              )}
            </div>

            <div className="field">
              <label className="label">Порядок *</label>
              <div className="control">
                <input
                  className={`input ${errors.sortOrder ? "is-danger" : ""}`}
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      sortOrder: e.target.value,
                    }))
                  }
                  disabled={!editingReportId}
                />
              </div>
              {errors.sortOrder && (
                <p className="help is-danger">{errors.sortOrder}</p>
              )}
            </div>

            <div className="field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      isActive: e.target.checked,
                    }))
                  }
                  disabled={!editingReportId}
                />{" "}
                Активний
              </label>
            </div>

            <div className="buttons">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving || !editingReportId}
              >
                Зберегти
              </button>
              <button
                type="button"
                className="button is-light"
                onClick={resetForm}
                disabled={saving}
              >
                Скинути
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
