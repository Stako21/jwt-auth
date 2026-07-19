import { useContext, useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import { AuthContext } from "../../context/AuthContext";
import {
  createBranchConfig,
  fetchBranchesConfig,
  setBranchConfigActive,
  updateBranchByIdConfig,
} from "../../services/config.api";
import { useAppConfig } from "../../context/AppConfigContext";
import { DataLoader } from "../DataLoader/DataLoader";

const defaultForm = {
  slug: "",
  name: "",
  shortName: "",
  cloneFromCurrentBranch: true,
};

function normalizeForm(branch) {
  if (!branch) return defaultForm;

  return {
    slug: branch.slug || "",
    name: branch.name || "",
    shortName: branch.shortName || "",
    cloneFromCurrentBranch: false,
  };
}

export function BranchConfig() {
  const {
    userInfo,
    reloadUserInfo,
    handleSwitchBranch,
    isSwitchingBranch,
  } = useContext(AuthContext);
  const { reloadConfig } = useAppConfig();
  const { enqueueSnackbar } = useSnackbar();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});
  const [createdBranch, setCreatedBranch] = useState(null);

  const currentBranchId = Number(
    userInfo?.currentBranch?.id || userInfo?.branchId || 0,
  );

  const loadBranches = async () => {
    setLoading(true);
    try {
      const nextBranches = await fetchBranchesConfig();
      setBranches(nextBranches);
    } catch (error) {
      console.error("Failed to load branches config:", error);
      enqueueSnackbar("Не вдалося завантажити філії", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const sortedBranches = useMemo(() => {
    return [...branches].sort((a, b) => {
      if (Number(Boolean(b.isActive)) !== Number(Boolean(a.isActive))) {
        return Number(Boolean(b.isActive)) - Number(Boolean(a.isActive));
      }

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [branches]);

  const validate = () => {
    const nextErrors = {};

    if (!form.slug.trim()) nextErrors.slug = "Обов'язкове поле";
    else if (!/^[a-z0-9-]+$/.test(form.slug.trim().toLowerCase())) {
      nextErrors.slug = "Лише a-z, 0-9 та дефіс";
    }

    if (!form.name.trim()) nextErrors.name = "Обов'язкове поле";
    if (!form.shortName.trim()) nextErrors.shortName = "Обов'язкове поле";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setEditingBranchId(null);
    setForm(defaultForm);
    setErrors({});
  };

  const reloadBranchViews = async () => {
    await Promise.all([loadBranches(), reloadConfig(), reloadUserInfo()]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        templateBranchId:
          !editingBranchId && form.cloneFromCurrentBranch && currentBranchId
            ? currentBranchId
            : null,
      };

      if (editingBranchId) {
        await updateBranchByIdConfig(editingBranchId, payload);
        enqueueSnackbar("Філію оновлено", { variant: "success" });
      } else {
        const branch = await createBranchConfig(payload);
        setCreatedBranch({
          id: Number(branch.id),
          name: branch.name || branch.shortName || branch.slug,
          clonedFromCurrentBranch: Boolean(payload.templateBranchId),
        });
        enqueueSnackbar("Філію створено", { variant: "success" });
      }

      await reloadBranchViews();
      resetForm();
    } catch (error) {
      console.error("Failed to save branch config:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося зберегти філію",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (branch) => {
    setSaving(true);
    try {
      await setBranchConfigActive(branch.id, !branch.isActive);
      enqueueSnackbar(
        branch.isActive ? "Філію деактивовано" : "Філію активовано",
        { variant: "success" },
      );
      await reloadBranchViews();
      if (editingBranchId === branch.id && branch.isActive) {
        resetForm();
      }
    } catch (error) {
      console.error("Failed to toggle branch active:", error);
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося змінити статус філії",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchToCreatedBranch = async () => {
    if (!createdBranch?.id) return;

    try {
      await handleSwitchBranch(createdBranch.id);
      setCreatedBranch(null);
      await reloadBranchViews();
    } catch (error) {
      console.error("Failed to switch to created branch:", error);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="columns">
        <div className="column is-7">
          <div className="level mb-3">
            <div className="level-left">
              <div>
                <h3 className="title is-5 mb-1">Філії</h3>
                <p className="is-size-7 has-text-grey">
                  Нові філії автоматично додаються до списку доступних філій
                  поточного адміністратора.
                </p>
              </div>
            </div>
          </div>

          {createdBranch && Number(createdBranch.id) !== currentBranchId && (
            <div className="notification is-info is-light">
              <div className="content">
                <p className="mb-2">
                  <strong>{createdBranch.name}</strong> успішно створено.
                </p>
                <p className="mb-2">
                  {createdBranch.clonedFromCurrentBranch
                    ? "Перейдіть до неї зараз і перевірте скопійовані міста, сторінки залишків і звіти."
                    : "Перейдіть до неї зараз і продовжуйте налаштування міст, сторінок залишків і звітів."}
                </p>
                <div className="buttons">
                  <button
                    type="button"
                    className={`button is-link ${
                      isSwitchingBranch ? "is-loading" : ""
                    }`}
                    onClick={handleSwitchToCreatedBranch}
                    disabled={saving || isSwitchingBranch}
                  >
                    Перейти зараз
                  </button>
                  <button
                    type="button"
                    className="button is-light"
                    onClick={() => setCreatedBranch(null)}
                    disabled={saving || isSwitchingBranch}
                  >
                    Пізніше
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <DataLoader label="Завантаження філій…" compact />
          ) : (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-hoverable">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Слаг</th>
                    <th>Назва</th>
                    <th>Коротко</th>
                    <th>Статус</th>
                    <th>Поточна</th>
                    <th className="has-text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBranches.map((branch) => (
                    <tr key={branch.id}>
                      <td>{branch.id}</td>
                      <td>{branch.slug}</td>
                      <td>{branch.name}</td>
                      <td>{branch.shortName}</td>
                      <td>
                        <span
                          className={`tag ${
                            branch.isActive
                              ? "is-success"
                              : "is-light has-text-grey-light"
                          }`}
                        >
                          {branch.isActive ? "Активна" : "Неактивна"}
                        </span>
                      </td>
                      <td>
                        {Number(branch.id) === currentBranchId ? (
                          <span className="tag is-info is-light">Так</span>
                        ) : (
                          <span className="has-text-grey">-</span>
                        )}
                      </td>
                      <td className="has-text-right">
                        <div className="buttons is-right are-small">
                          <button
                            type="button"
                            className="button is-info"
                            onClick={() => {
                              setEditingBranchId(branch.id);
                              setForm(normalizeForm(branch));
                              setErrors({});
                            }}
                            disabled={saving}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`button ${
                              branch.isActive ? "is-warning" : "is-success"
                            }`}
                            onClick={() => handleToggleActive(branch)}
                            disabled={saving}
                          >
                            {branch.isActive ? "Off" : "On"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!sortedBranches.length && (
                    <tr>
                      <td colSpan="7" className="has-text-centered has-text-grey">
                        Філії ще не налаштовані
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
            {editingBranchId ? "Картка філії" : "Нова філія"}
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
                  placeholder="default"
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
                  placeholder="Філія за замовчуванням"
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
                  placeholder="За замовчуванням"
                />
              </div>
              {errors.shortName && (
                <p className="help is-danger">{errors.shortName}</p>
              )}
            </div>

            {!editingBranchId && (
              <div className="field">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.cloneFromCurrentBranch}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        cloneFromCurrentBranch: e.target.checked,
                      }))
                    }
                    disabled={saving || !currentBranchId}
                  />{" "}
                  Клонувати міста, сторінки залишків і звіти з поточної філії
                </label>
                <p className="help">
                  Джерела імпорту й налаштування планувальника залишаються
                  глобальними та не дублюються.
                </p>
              </div>
            )}

            <div className="buttons">
              <button
                type="submit"
                className={`button is-primary ${saving ? "is-loading" : ""}`}
                disabled={saving}
              >
                {editingBranchId ? "Зберегти" : "Створити"}
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
