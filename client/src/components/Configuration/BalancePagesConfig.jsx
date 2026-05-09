import { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import {
  createBalancePageConfig,
  fetchBalancePagesConfig,
  setBalancePageConfigActive,
  updateBalancePageConfig,
} from "../../services/config.api";
import { useAppConfig } from "../../context/AppConfigContext";

const defaultForm = {
  slug: "",
  menuTitle: "",
  headerTitle: "",
  fileName: "",
  cityId: "",
  sortOrder: 0,
  isActive: true,
};

function normalizeForm(page) {
  if (!page) return defaultForm;

  return {
    slug: page.slug || "",
    menuTitle: page.menuTitle || "",
    headerTitle: page.headerTitle || "",
    fileName: page.fileName || "",
    cityId: page.cityId ?? "",
    sortOrder: Number(page.sortOrder) || 0,
    isActive: Boolean(page.isActive),
  };
}

export function BalancePagesConfig() {
  const { cities, reloadConfig } = useAppConfig();
  const { enqueueSnackbar } = useSnackbar();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPageId, setEditingPageId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});

  const loadPages = async () => {
    setLoading(true);
    try {
      const nextPages = await fetchBalancePagesConfig();
      setPages(nextPages);
    } catch (error) {
      console.error("Failed to load balance pages config:", error);
      enqueueSnackbar("Не вдалося завантажити сторінки залишків", {
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const sortedPages = useMemo(() => {
    return [...pages].sort((a, b) => {
      const sortDiff = Number(a.sortOrder) - Number(b.sortOrder);
      if (sortDiff !== 0) return sortDiff;
      return String(a.menuTitle || "").localeCompare(String(b.menuTitle || ""));
    });
  }, [pages]);

  const cityOptions = useMemo(() => {
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

    if (!form.menuTitle.trim()) nextErrors.menuTitle = "Обов'язкове поле";
    if (!form.headerTitle.trim()) nextErrors.headerTitle = "Обов'язкове поле";
    if (!form.fileName.trim()) nextErrors.fileName = "Обов'язкове поле";
    if (!Number.isInteger(Number(form.sortOrder))) {
      nextErrors.sortOrder = "Має бути цілим числом";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setEditingPageId(null);
    setForm(defaultForm);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        menuTitle: form.menuTitle.trim(),
        headerTitle: form.headerTitle.trim(),
        fileName: form.fileName.trim(),
        cityId: form.cityId === "" ? null : Number(form.cityId),
        sortOrder: Number(form.sortOrder),
        isActive: Boolean(form.isActive),
      };

      if (editingPageId) {
        await updateBalancePageConfig(editingPageId, payload);
        enqueueSnackbar("Сторінку залишків оновлено", {
          variant: "success",
        });
      } else {
        await createBalancePageConfig(payload);
        enqueueSnackbar("Сторінку залишків створено", {
          variant: "success",
        });
      }

      await Promise.all([loadPages(), reloadConfig()]);
      resetForm();
    } catch (error) {
      console.error("Failed to save balance page:", error);
      enqueueSnackbar(
        error.response?.data?.error ||
          "Не вдалося зберегти сторінку залишків",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (page) => {
    setSaving(true);
    try {
      await setBalancePageConfigActive(page.id, !page.isActive);
      enqueueSnackbar(
        page.isActive
          ? "Сторінку залишків деактивовано"
          : "Сторінку залишків активовано",
        { variant: "success" },
      );
      await Promise.all([loadPages(), reloadConfig()]);
      if (editingPageId === page.id && page.isActive) {
        setForm((current) => ({ ...current, isActive: false }));
      }
    } catch (error) {
      console.error("Failed to toggle balance page active:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося змінити статус сторінки",
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
          <h3 className="title is-5 mb-3">Сторінки залишків</h3>

          {loading ? (
            <p>Завантаження...</p>
          ) : (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>Slug</th>
                    <th>Меню</th>
                    <th>Заголовок</th>
                    <th>Файл</th>
                    <th>Місто</th>
                    <th>Порядок</th>
                    <th>Статус</th>
                    <th className="has-text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPages.map((page) => (
                    <tr key={page.id}>
                      <td>{page.slug}</td>
                      <td>{page.menuTitle}</td>
                      <td>{page.headerTitle}</td>
                      <td>{page.fileName}</td>
                      <td>{page.cityName || "—"}</td>
                      <td>{page.sortOrder}</td>
                      <td>
                        <span
                          className={`tag ${
                            page.isActive ? "is-success" : "is-light"
                          }`}
                        >
                          {page.isActive ? "Активна" : "Неактивна"}
                        </span>
                      </td>
                      <td className="has-text-right">
                        <div className="buttons is-right are-small">
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingPageId(page.id);
                              setForm(normalizeForm(page));
                              setErrors({});
                            }}
                            disabled={saving}
                          >
                            Редагувати
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              page.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(page)}
                            disabled={saving}
                          >
                            {page.isActive ? "Деактивувати" : "Активувати"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedPages.length && (
                    <tr>
                      <td colSpan="8" className="has-text-centered has-text-grey">
                        Сторінки залишків ще не налаштовані
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
            {editingPageId ? "Картка сторінки" : "Нова сторінка"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Slug *</label>
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
                  placeholder="ЗП"
                />
              </div>
              {errors.menuTitle && (
                <p className="help is-danger">{errors.menuTitle}</p>
              )}
            </div>

            <div className="field">
              <label className="label">Заголовок сторінки *</label>
              <div className="control">
                <input
                  className={`input ${errors.headerTitle ? "is-danger" : ""}`}
                  value={form.headerTitle}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      headerTitle: e.target.value,
                    }))
                  }
                  placeholder="Запоріжжя"
                />
              </div>
              {errors.headerTitle && (
                <p className="help is-danger">{errors.headerTitle}</p>
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
                  placeholder="balanceZP.xlsx"
                />
              </div>
              {errors.fileName && (
                <p className="help is-danger">{errors.fileName}</p>
              )}
            </div>

            <div className="field">
              <label className="label">Місто</label>
              <div className="control">
                <div className="select is-fullwidth">
                  <select
                    value={form.cityId}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        cityId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Без прив'язки</option>
                    {cityOptions.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name} ({city.shortName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
                Активна
              </label>
            </div>

            <div className="buttons">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving}
              >
                {editingPageId ? "Зберегти" : "Створити"}
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
