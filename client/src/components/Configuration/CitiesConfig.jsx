import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import {
  createCityConfig,
  fetchCitiesConfig,
  setCityConfigActive,
  updateCityConfig,
} from "../../services/config.api";
import { useAppConfig } from "../../context/AppConfigContext";

const defaultForm = {
  slug: "",
  name: "",
  shortName: "",
  documentPrefix: "",
  sortOrder: 0,
  isActive: true,
};

function normalizeForm(city) {
  if (!city) return defaultForm;

  return {
    slug: city.slug || "",
    name: city.name || "",
    shortName: city.shortName || "",
    documentPrefix: city.documentPrefix || "",
    sortOrder: Number(city.sortOrder) || 0,
    isActive: Boolean(city.isActive),
  };
}

export function CitiesConfig() {
  const { appConfig, reloadConfig } = useAppConfig();
  const { enqueueSnackbar } = useSnackbar();
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCityId, setEditingCityId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});

  const branch = appConfig?.branch || null;

  const loadCities = async () => {
    setLoading(true);
    try {
      const nextCities = await fetchCitiesConfig();
      setCities(nextCities);
    } catch (error) {
      console.error("Failed to load cities config:", error);
      enqueueSnackbar("Не вдалося завантажити міста", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCities();
  }, []);

  const sortedCities = useMemo(() => {
    return [...cities].sort((a, b) => {
      const sortDiff = Number(a.sortOrder) - Number(b.sortOrder);
      if (sortDiff !== 0) return sortDiff;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [cities]);

  const validate = () => {
    const nextErrors = {};

    if (!form.slug.trim()) nextErrors.slug = "Обов'язкове поле";
    else if (!/^[a-z0-9-]+$/.test(form.slug.trim().toLowerCase())) {
      nextErrors.slug = "Лише a-z, 0-9 та дефіс";
    }

    if (!form.name.trim()) nextErrors.name = "Обов'язкове поле";
    if (!form.shortName.trim()) nextErrors.shortName = "Обов'язкове поле";
    if (!form.documentPrefix.trim()) {
      nextErrors.documentPrefix = "Обов'язкове поле";
    }
    if (!Number.isInteger(Number(form.sortOrder))) {
      nextErrors.sortOrder = "Має бути цілим числом";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setEditingCityId(null);
    setForm(defaultForm);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        documentPrefix: form.documentPrefix.trim(),
        sortOrder: Number(form.sortOrder),
      };

      if (editingCityId) {
        await updateCityConfig(editingCityId, payload);
        enqueueSnackbar("Місто оновлено", { variant: "success" });
      } else {
        await createCityConfig(payload);
        enqueueSnackbar("Місто створено", { variant: "success" });
      }

      await Promise.all([loadCities(), reloadConfig()]);
      resetForm();
    } catch (error) {
      console.error("Failed to save city:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося зберегти місто",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (city) => {
    setSaving(true);
    try {
      await setCityConfigActive(city.id, !city.isActive);
      enqueueSnackbar(
        city.isActive ? "Місто деактивовано" : "Місто активовано",
        { variant: "success" },
      );
      await Promise.all([loadCities(), reloadConfig()]);
      if (editingCityId === city.id && city.isActive) {
        setForm((current) => ({ ...current, isActive: false }));
      }
    } catch (error) {
      console.error("Failed to toggle city active:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося змінити статус міста",
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
                <h3 className="title is-5 mb-1">Міста</h3>
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
                    <th>Слаг</th>
                    <th>Назва</th>
                    <th>Коротко</th>
                    <th>Префікс</th>
                    <th>Порядок</th>
                    <th>Статус</th>
                    <th className="has-text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCities.map((city) => (
                    <tr key={city.id}>
                      <td>{city.slug}</td>
                      <td>{city.name}</td>
                      <td>{city.shortName}</td>
                      <td>{city.documentPrefix}</td>
                      <td>{city.sortOrder}</td>
                      <td>
                        <span
                          className={`tag ${
                            city.isActive
                              ? "is-success"
                              : "is-light has-text-grey-light"
                          }`}
                        >
                          {city.isActive ? "Активне" : "Неактивне"}
                        </span>
                      </td>
                      <td className="has-text-right">
                        <div className="buttons is-right are-small">
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingCityId(city.id);
                              setForm(normalizeForm(city));
                              setErrors({});
                            }}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              city.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(city)}
                            disabled={saving}
                          >
                            {city.isActive ? "Off" : "On"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedCities.length && (
                    <tr>
                      <td colSpan="7" className="has-text-centered has-text-grey">
                        Міста ще не налаштовані
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
            {editingCityId ? "Картка міста" : "Нове місто"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Слаг *</label>
              <div className="control">
                <input
                  className={`input ${errors.slug ? "is-danger" : ""}`}
                  value={form.slug}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, slug: e.target.value }))
                  }
                  placeholder="zp"
                />
              </div>
              {errors.slug && <p className="help is-danger">{errors.slug}</p>}
            </div>

            <div className="field">
              <label className="label">Повна назва *</label>
              <div className="control">
                <input
                  className={`input ${errors.name ? "is-danger" : ""}`}
                  value={form.name}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, name: e.target.value }))
                  }
                  placeholder="Запоріжжя"
                />
              </div>
              {errors.name && <p className="help is-danger">{errors.name}</p>}
            </div>

            <div className="field">
              <label className="label">Коротка назва *</label>
              <div className="control">
                <input
                  className={`input ${errors.shortName ? "is-danger" : ""}`}
                  value={form.shortName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      shortName: e.target.value,
                    }))
                  }
                  placeholder="ЗП"
                />
              </div>
              {errors.shortName && (
                <p className="help is-danger">{errors.shortName}</p>
              )}
            </div>

            <div className="field">
              <label className="label">Префікс документів *</label>
              <div className="control">
                <input
                  className={`input ${
                    errors.documentPrefix ? "is-danger" : ""
                  }`}
                  value={form.documentPrefix}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      documentPrefix: e.target.value,
                    }))
                  }
                  placeholder="ЗП"
                />
              </div>
              {errors.documentPrefix && (
                <p className="help is-danger">{errors.documentPrefix}</p>
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
                />{" "}
                Активне
              </label>
            </div>

            <div className="buttons">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving}
              >
                {editingCityId ? "Зберегти" : "Створити"}
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
