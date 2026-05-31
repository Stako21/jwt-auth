import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import {
  fetchImportSourcesConfig,
  setImportSourceConfigActive,
  updateImportSourceConfig,
} from "../../services/config.api";

const defaultForm = {
  sourceKey: "",
  fileName: "",
  deleteAfterSuccess: true,
  isActive: true,
};

const SOURCE_LABELS = {
  loadSalesAgents: "Імпорт торгових агентів",
  loadSalesReports: "Імпорт продажів",
  loadProducts: "Імпорт товарів",
  loadTradePoints: "Імпорт ТТ",
  loadOrdersByTimeReport: "Звіт заявок ТА по часам",
  loadBillOfLadingReport: "Звіт зібраних накладних",
  reportRomashka: "Файл звіту Ромашка",
};

function normalizeForm(source) {
  if (!source) return defaultForm;

  return {
    sourceKey: source.sourceKey || "",
    fileName: source.fileName || "",
    deleteAfterSuccess: Boolean(source.deleteAfterSuccess),
    isActive: Boolean(source.isActive),
  };
}

function getSourceLabel(sourceKey) {
  return SOURCE_LABELS[sourceKey] || sourceKey;
}

export function ImportSourcesConfig() {
  const { enqueueSnackbar } = useSnackbar();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});

  const loadSources = async () => {
    setLoading(true);
    try {
      const nextSources = await fetchImportSourcesConfig();
      setSources(nextSources);
    } catch (error) {
      console.error("Failed to load import sources config:", error);
      enqueueSnackbar("Не вдалося завантажити джерела імпорту", {
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const sortedSources = useMemo(() => {
    return [...sources].sort((a, b) =>
      String(a.sourceKey || "").localeCompare(String(b.sourceKey || "")),
    );
  }, [sources]);

  const validate = () => {
    const nextErrors = {};
    if (!form.fileName.trim()) nextErrors.fileName = "Обов'язкове поле";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setEditingSourceId(null);
    setForm(defaultForm);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingSourceId) return;
    if (!validate()) return;

    setSaving(true);
    try {
      await updateImportSourceConfig(editingSourceId, {
        fileName: form.fileName.trim(),
        deleteAfterSuccess: Boolean(form.deleteAfterSuccess),
        isActive: Boolean(form.isActive),
      });

      enqueueSnackbar("Налаштування джерела імпорту оновлено", {
        variant: "success",
      });
      await loadSources();
    } catch (error) {
      console.error("Failed to save import source config:", error);
      enqueueSnackbar(
        error.response?.data?.error ||
          "Не вдалося зберегти налаштування джерела імпорту",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (source) => {
    setSaving(true);
    try {
      await setImportSourceConfigActive(source.id, !source.isActive);
      enqueueSnackbar(
        source.isActive
          ? "Джерело імпорту деактивовано"
          : "Джерело імпорту активовано",
        { variant: "success" },
      );
      await loadSources();
      if (editingSourceId === source.id && source.isActive) {
        setForm((current) => ({ ...current, isActive: false }));
      }
    } catch (error) {
      console.error("Failed to toggle import source active:", error);
      enqueueSnackbar(
        error.response?.data?.error ||
          "Не вдалося змінити статус джерела імпорту",
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
          <h3 className="title is-5 mb-3">Імпорт</h3>

          {loading ? (
            <p>Завантаження...</p>
          ) : (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>Ключ</th>
                    <th>Опис</th>
                    <th>Файл</th>
                    <th>Видаляти після успіху</th>
                    <th>Статус</th>
                    <th className="has-text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSources.map((source) => (
                    <tr key={source.id}>
                      <td>{source.sourceKey}</td>
                      <td>{getSourceLabel(source.sourceKey)}</td>
                      <td>{source.fileName}</td>
                      <td>{source.deleteAfterSuccess ? "Так" : "Ні"}</td>
                      <td>
                        <span
                          className={`tag ${
                            source.isActive
                              ? "is-success"
                              : "is-light has-text-grey-light"
                          }`}
                        >
                          {source.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="has-text-right">
                        <div className="buttons is-right are-small">
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingSourceId(source.id);
                              setForm(normalizeForm(source));
                              setErrors({});
                            }}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              source.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(source)}
                            disabled={saving}
                          >
                            {source.isActive ? "Off" : "On"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedSources.length && (
                    <tr>
                      <td colSpan="6" className="has-text-centered has-text-grey">
                        Джерела імпорту ще не налаштовані
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
            {editingSourceId ? "Картка джерела" : "Оберіть джерело"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Ключ</label>
              <div className="control">
                <input className="input" value={form.sourceKey} disabled />
              </div>
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
                  placeholder="SalesReport.json"
                  disabled={!editingSourceId}
                />
              </div>
              <p className="help">
                Підтримуються шаблони <code>{"{branchSlug}"}</code> і{" "}
                <code>{"{branchId}"}</code>, а також вкладені шляхи в межах{" "}
                <code>IMPORT_DIR</code>. Якщо шаблони не вказані, backend
                спочатку шукає файл у папці філії, а потім у корені{" "}
                <code>IMPORT_DIR</code>.
              </p>
              {errors.fileName && (
                <p className="help is-danger">{errors.fileName}</p>
              )}
            </div>

            <div className="field">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.deleteAfterSuccess}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      deleteAfterSuccess: e.target.checked,
                    }))
                  }
                  disabled={!editingSourceId}
                />{" "}
                Видаляти файл після успішної обробки
              </label>
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
                  disabled={!editingSourceId}
                />{" "}
                Active
              </label>
            </div>

            <div className="buttons">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving || !editingSourceId}
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
