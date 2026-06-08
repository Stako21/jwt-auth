import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import {
  createReportConfig,
  fetchReportsConfig,
  setReportConfigActive,
  updateReportConfig,
} from "../../services/config.api";
import { useAppConfig } from "../../context/AppConfigContext";
import { ROLE_IDS, ROLE_OPTIONS } from "../../utils/roles";

const ALL_NON_ADMIN_ROLE_IDS = ROLE_OPTIONS.map((option) =>
  Number(option.value),
).filter((roleId) => roleId !== ROLE_IDS.Admin);

const compactCellStyle = {
  verticalAlign: "middle",
};

const rolesCellStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
};

const formFieldClassName = "field mb-2";
const labelClassName = "label is-size-7 mb-1";

const defaultForm = {
  reportKey: "",
  route: "",
  menuTitle: "",
  fileName: "",
  reportType: "xlsx-1c",
  sheetName: "",
  headerRow: 12,
  dataStartRow: 15,
  retentionDays: 31,
  scheduledImportEnabled: false,
  allowedRoles: ALL_NON_ADMIN_ROLE_IDS,
  sortOrder: 0,
  isActive: true,
};

function normalizeAllowedRoles(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(Number).filter((roleId) => Number.isInteger(roleId));
  }

  if (typeof value === "string") {
    try {
      return normalizeAllowedRoles(JSON.parse(value));
    } catch {
      return value
        .split(",")
        .map(Number)
        .filter((roleId) => Number.isInteger(roleId));
    }
  }

  return null;
}

function normalizeForm(report) {
  if (!report) return defaultForm;

  const allowedRoles = normalizeAllowedRoles(report.allowedRoles);

  return {
    reportKey: report.reportKey || "",
    route: report.route || "",
    menuTitle: report.menuTitle || "",
    fileName: report.fileName || "",
    reportType: report.reportType || "static-json",
    sheetName: report.sheetName || "",
    headerRow: report.headerRow ?? "",
    dataStartRow: report.dataStartRow ?? "",
    retentionDays: report.retentionDays ?? 31,
    scheduledImportEnabled: Boolean(report.scheduledImportEnabled),
    allowedRoles: allowedRoles === null ? ALL_NON_ADMIN_ROLE_IDS : allowedRoles,
    sortOrder: Number(report.sortOrder) || 0,
    isActive: Boolean(report.isActive),
  };
}

function getAllowedRoleLabels(allowedRoles) {
  const normalizedRoles = normalizeAllowedRoles(allowedRoles);

  if (normalizedRoles === null) {
    return ["Усі ролі"];
  }

  if (normalizedRoles.length === 0) {
    return ["Admin"];
  }

  const labelsByRole = new Map(
    ROLE_OPTIONS.map((option) => [Number(option.value), option.label]),
  );

  const labels = normalizedRoles
    .map(Number)
    .filter((roleId) => roleId !== ROLE_IDS.Admin)
    .map((roleId) => labelsByRole.get(roleId) || String(roleId))
    .filter(Boolean);

  return labels.length ? labels : ["Admin"];
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

    if (!form.reportKey.trim()) nextErrors.reportKey = "Обов'язкове поле";
    else if (!/^[a-z0-9-]+$/.test(form.reportKey.trim().toLowerCase())) {
      nextErrors.reportKey = "Лише a-z, 0-9 та дефіс";
    }

    if (!form.route.trim()) nextErrors.route = "Обов'язкове поле";
    else if (!form.route.trim().startsWith("/")) {
      nextErrors.route = "Маршрут має починатися з /";
    }

    if (!form.menuTitle.trim()) nextErrors.menuTitle = "Обов'язкове поле";
    if (!form.fileName.trim()) nextErrors.fileName = "Обов'язкове поле";
    if (form.reportType === "xlsx-1c" || form.reportType === "xlsx-1c-sales") {
      if (!Number.isInteger(Number(form.headerRow)) || Number(form.headerRow) <= 0) {
        nextErrors.headerRow = "Додатне ціле число";
      }
      if (
        !Number.isInteger(Number(form.dataStartRow)) ||
        Number(form.dataStartRow) <= 0
      ) {
        nextErrors.dataStartRow = "Додатне ціле число";
      }
      if (
        Number.isInteger(Number(form.headerRow)) &&
        Number.isInteger(Number(form.dataStartRow)) &&
        Number(form.dataStartRow) < Number(form.headerRow)
      ) {
        nextErrors.dataStartRow = "Не раніше рядка заголовків";
      }
    }

    if (
      form.retentionDays !== "" &&
      (!Number.isInteger(Number(form.retentionDays)) ||
        Number(form.retentionDays) <= 0)
    ) {
      nextErrors.retentionDays = "Додатне ціле число";
    }

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
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        reportKey: form.reportKey.trim().toLowerCase(),
        route: form.route.trim(),
        menuTitle: form.menuTitle.trim(),
        fileName: form.fileName.trim(),
        reportType: form.reportType,
        sheetName: form.sheetName.trim() || null,
        headerRow:
          form.reportType === "xlsx-1c" || form.reportType === "xlsx-1c-sales"
            ? Number(form.headerRow)
            : null,
        dataStartRow:
          form.reportType === "xlsx-1c" || form.reportType === "xlsx-1c-sales"
            ? Number(form.dataStartRow)
            : null,
        retentionDays: form.retentionDays ? Number(form.retentionDays) : null,
        scheduledImportEnabled:
          form.reportType === "xlsx-1c-sales"
            ? Boolean(form.scheduledImportEnabled)
            : false,
        allowedRoles: form.allowedRoles,
        sortOrder: Number(form.sortOrder),
        isActive: Boolean(form.isActive),
      };

      if (editingReportId) {
        await updateReportConfig(editingReportId, payload);
      } else {
        await createReportConfig(payload);
      }
      enqueueSnackbar("Налаштування звіту оновлено", { variant: "success" });

      await Promise.all([loadReports(), reloadConfig()]);
      resetForm();
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

  const handleRoleChange = (roleId, checked) => {
    setForm((current) => {
      const currentRoles = Array.isArray(current.allowedRoles)
        ? current.allowedRoles.map(Number)
        : [];
      const nextRoles = checked
        ? [...new Set([...currentRoles, roleId])]
        : currentRoles.filter((selectedRoleId) => selectedRoleId !== roleId);

      return {
        ...current,
        allowedRoles: nextRoles.sort((a, b) => a - b),
      };
    });
  };

  return (
    <div style={{ padding: 10, fontSize: 13 }}>
      <div className="columns is-variable is-2">
        <div className="column is-8">
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
              <table
                className="table is-fullwidth is-striped is-hoverable is-narrow"
                style={{ fontSize: 12 }}
              >
                <thead>
                  <tr>
                    <th>Ключ</th>
                    <th>Маршрут</th>
                    <th>Назва</th>
                    <th>Файл</th>
                    <th>Оновл.</th>
                    <th>Ролі</th>
                    <th>Пор.</th>
                    <th>Статус</th>
                    <th className="has-text-right">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedReports.map((report) => (
                    <tr key={report.id}>
                      <td style={compactCellStyle} title={report.reportKey}>
                        {report.reportKey}
                      </td>
                      <td style={compactCellStyle} title={report.route}>
                        {report.route}
                      </td>
                      <td style={compactCellStyle} title={report.menuTitle}>
                        {report.menuTitle}
                      </td>
                      <td style={compactCellStyle} title={report.fileName || "—"}>
                        {report.fileName || "—"}
                      </td>
                      <td style={compactCellStyle}>
                        {report.reportType === "xlsx-1c-sales" ? (
                          <span
                            className={`tag is-small ${
                              report.scheduledImportEnabled ? "is-success" : "is-light"
                            }`}
                          >
                            {report.scheduledImportEnabled ? "Schedule" : "Open"}
                          </span>
                        ) : (
                          <span className="tag is-small is-light">Open</span>
                        )}
                      </td>
                      <td>
                        <div style={rolesCellStyle}>
                          {getAllowedRoleLabels(report.allowedRoles).map((label) => (
                            <span className="tag is-info is-light is-small" key={label}>
                              {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="has-text-centered">{report.sortOrder}</td>
                      <td>
                        <span
                          className={`tag is-small ${
                            report.isActive
                              ? "is-success"
                              : "is-light has-text-grey-light"
                          }`}
                        >
                          {report.isActive ? "Активний" : "Неактивний"}
                        </span>
                      </td>
                      <td className="has-text-right">
                        <div
                          className="buttons is-right are-small"
                          style={{ gap: 4, marginBottom: 0 }}
                        >
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingReportId(report.id);
                              setForm(normalizeForm(report));
                              setErrors({});
                            }}
                            disabled={saving}
                            title="Редагувати"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              report.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(report)}
                            disabled={saving}
                            title={report.isActive ? "Деактивувати" : "Активувати"}
                          >
                            {report.isActive ? "Off" : "On"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedReports.length && (
                    <tr>
                      <td colSpan="9" className="has-text-centered has-text-grey">
                        Звіти ще не налаштовані
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="column is-4">
          <h3 className="title is-6 mb-3">
            {editingReportId ? "Картка звіту" : "Оберіть звіт"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className={formFieldClassName}>
              <label className={labelClassName}>Ключ</label>
              <div className="control">
                <input
                  className={`input is-small ${errors.reportKey ? "is-danger" : ""}`}
                  value={form.reportKey}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      reportKey: e.target.value,
                    }))
                  }
                  placeholder="report-max"
                />
              </div>
              {errors.reportKey && (
                <p className="help is-danger">{errors.reportKey}</p>
              )}
            </div>

            <div className={formFieldClassName}>
              <label className={labelClassName}>Маршрут *</label>
              <div className="control">
                <input
                  className={`input is-small ${errors.route ? "is-danger" : ""}`}
                  value={form.route}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, route: e.target.value }))
                  }
                  placeholder="/report-max"
                />
              </div>
              {errors.route && <p className="help is-danger">{errors.route}</p>}
            </div>

            <div className={formFieldClassName}>
              <label className={labelClassName}>Назва в меню *</label>
              <div className="control">
                <input
                  className={`input is-small ${errors.menuTitle ? "is-danger" : ""}`}
                  value={form.menuTitle}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      menuTitle: e.target.value,
                    }))
                  }
                  placeholder="Звіт Ромашка"
                />
              </div>
              {errors.menuTitle && (
                <p className="help is-danger">{errors.menuTitle}</p>
              )}
            </div>

            <div className={formFieldClassName}>
              <label className={labelClassName}>Файл *</label>
              <div className="control">
                <input
                  className={`input is-small ${errors.fileName ? "is-danger" : ""}`}
                  value={form.fileName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      fileName: e.target.value,
                    }))
                  }
                  placeholder="Max.xlsx"
                />
              </div>
              {errors.fileName && (
                <p className="help is-danger">{errors.fileName}</p>
              )}
            </div>

            <div className={formFieldClassName}>
              <label className={labelClassName}>Тип звіту *</label>
              <div className="control">
                <div className="select is-small is-fullwidth">
                  <select
                    value={form.reportType}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        reportType: e.target.value,
                      }))
                    }
                  >
                    <option value="xlsx-1c">Звіти XLSX з 1С</option>
                    <option value="xlsx-1c-sales">XLSX 1C sales DB</option>
                    <option value="static-json">Static JSON</option>
                  </select>
                </div>
              </div>
            </div>

            {(form.reportType === "xlsx-1c" ||
              form.reportType === "xlsx-1c-sales") && (
              <>
                <div className={formFieldClassName}>
                  <label className={labelClassName}>Лист Excel</label>
                  <div className="control">
                    <input
                      className="input is-small"
                      value={form.sheetName}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          sheetName: e.target.value,
                        }))
                      }
                      placeholder="Порожньо = перший лист"
                    />
                  </div>
                </div>

                <div className="columns is-variable is-2 mb-1">
                  <div className="column">
                    <label className={labelClassName}>Рядок заголовків *</label>
                    <input
                      className={`input is-small ${
                        errors.headerRow ? "is-danger" : ""
                      }`}
                      type="number"
                      min="1"
                      value={form.headerRow}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          headerRow: e.target.value,
                        }))
                      }
                    />
                    {errors.headerRow && (
                      <p className="help is-danger">{errors.headerRow}</p>
                    )}
                  </div>
                  <div className="column">
                    <label className={labelClassName}>Дані з рядка *</label>
                    <input
                      className={`input is-small ${
                        errors.dataStartRow ? "is-danger" : ""
                      }`}
                      type="number"
                      min="1"
                      value={form.dataStartRow}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          dataStartRow: e.target.value,
                        }))
                      }
                    />
                    {errors.dataStartRow && (
                      <p className="help is-danger">{errors.dataStartRow}</p>
                    )}
                  </div>
                </div>

                <div className={formFieldClassName}>
                  <label className={labelClassName}>Зберігати, днів</label>
                  <input
                    className={`input is-small ${
                      errors.retentionDays ? "is-danger" : ""
                    }`}
                    type="number"
                    min="1"
                    value={form.retentionDays}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        retentionDays: e.target.value,
                      }))
                    }
                  />
                  {errors.retentionDays && (
                    <p className="help is-danger">{errors.retentionDays}</p>
                  )}
                </div>

                {form.reportType === "xlsx-1c-sales" && (
                  <div className={formFieldClassName}>
                    <label className="checkbox" style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={form.scheduledImportEnabled}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            scheduledImportEnabled: e.target.checked,
                          }))
                        }
                      />{" "}
                      Оновлювати за розкладом
                    </label>
                    <p className="help" style={{ fontSize: 11, lineHeight: 1.25 }}>
                      Якщо вимкнено, звіт оновлюється при відкритті сторінки.
                    </p>
                  </div>
                )}
              </>
            )}

            <div className={formFieldClassName}>
              <label className={labelClassName}>Ролі з доступом</label>
              <div
                className="field is-grouped is-grouped-multiline mb-1"
                style={{ gap: 4 }}
              >
                {ROLE_OPTIONS.map((roleOption) => {
                  const roleId = Number(roleOption.value);
                  const isAdminRole = roleId === ROLE_IDS.Admin;
                  const selectedRoles = Array.isArray(form.allowedRoles)
                    ? form.allowedRoles.map(Number)
                    : [];
                  const isChecked =
                    isAdminRole || selectedRoles.includes(roleId);

                  return (
                    <label
                      className="checkbox mr-2 mb-1"
                      key={roleId}
                      style={{ fontSize: 12, whiteSpace: "nowrap" }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isAdminRole}
                        onChange={(e) =>
                          handleRoleChange(roleId, e.target.checked)
                        }
                      />{" "}
                      {roleOption.label}
                    </label>
                  );
                })}
              </div>
              <p className="help mb-1" style={{ fontSize: 11, lineHeight: 1.25 }}>
                Адмін завжди має доступ. Зніміть усі інші ролі, щоб залишити
                звіт тільки для адміна.
              </p>
            </div>

            <div className={formFieldClassName}>
              <label className={labelClassName}>Порядок *</label>
              <div className="control">
                <input
                  className={`input is-small ${errors.sortOrder ? "is-danger" : ""}`}
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      sortOrder: e.target.value,
                    }))
                  }
                />
              </div>
              {errors.sortOrder && (
                <p className="help is-danger">{errors.sortOrder}</p>
              )}
            </div>

            <div className={formFieldClassName}>
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
                />{" "}
                Активний
              </label>
            </div>

            <div className="buttons are-small">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving}
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
