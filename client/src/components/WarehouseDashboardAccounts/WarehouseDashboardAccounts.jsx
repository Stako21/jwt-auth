import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import FormInput from "../FormControl/FormInput.jsx";
import {
  createWarehouseDashboardAccount,
  fetchWarehouseDashboardAccounts,
  updateWarehouseDashboardAccount,
} from "../../services/warehouseDashboard.api.js";
import style from "./WarehouseDashboardAccounts.module.scss";

const emptyForm = {
  login: "",
  displayName: "",
  password: "",
  isActive: true,
  warehouseIds: [],
};

export function WarehouseDashboardAccounts() {
  const { enqueueSnackbar } = useSnackbar();
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchWarehouseDashboardAccounts();
      setAccounts(data.accounts || []);
      setWarehouses(data.warehouses || []);
    } catch (error) {
      console.error(error);
      enqueueSnackbar("Не вдалося завантажити облікові записи екранів", {
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, warehouseIds: [] });
    setEditorOpen(true);
  };

  const openEdit = (account) => {
    setEditingId(account.id);
    setForm({
      login: account.login,
      displayName: account.displayName || "",
      password: "",
      isActive: account.isActive,
      warehouseIds: account.warehouses.map((warehouse) => warehouse.id),
    });
    setEditorOpen(true);
  };

  const close = () => {
    setEditorOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const toggleWarehouse = (id) => {
    setForm((current) => ({
      ...current,
      warehouseIds: current.warehouseIds.includes(id)
        ? current.warehouseIds.filter((warehouseId) => warehouseId !== id)
        : [...current.warehouseIds, id],
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateWarehouseDashboardAccount(editingId, form);
      } else {
        await createWarehouseDashboardAccount(form);
      }
      enqueueSnackbar("Обліковий запис складського екрана збережено", {
        variant: "success",
      });
      close();
      await load();
    } catch (error) {
      enqueueSnackbar(
        error?.response?.data?.error || "Не вдалося зберегти обліковий запис",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={style.workspace}>
      <div className={style.toolbar}>
        <div>
          <h2>Складські екрани</h2>
          <p>Окремі облікові записи для телевізійного рейтингу.</p>
        </div>
        <button type="button" className="button is-primary" onClick={openNew}>
          Створити запис
        </button>
      </div>

      <div className="table-container">
        <table className="table is-fullwidth">
          <thead>
            <tr>
              <th>Логін</th>
              <th>Назва</th>
              <th>Доступні склади</th>
              <th>Стан</th>
              <th aria-label="Дії" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5">Завантаження…</td></tr>
            ) : null}
            {!loading && !accounts.length ? (
              <tr><td colSpan="5">Облікових записів ще немає</td></tr>
            ) : null}
            {accounts.map((account) => (
              <tr key={account.id}>
                <td><strong>{account.login}</strong></td>
                <td>{account.displayName}</td>
                <td>
                  {account.warehouses.map((warehouse) => warehouse.warehouseName).join(", ") || "—"}
                </td>
                <td className={account.isActive ? style.active : style.inactive}>
                  {account.isActive ? "Активний" : "Вимкнений"}
                </td>
                <td>
                  <button
                    type="button"
                    className="button is-small"
                    onClick={() => openEdit(account)}
                  >
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editorOpen ? (
        <div className="modal is-active admin-modal">
          <div className="modal-background" onClick={close} />
          <form className={`modal-card ${style.modalCard}`} onSubmit={save}>
            <header className="modal-card-head">
              <p className="modal-card-title">
                {editingId ? "Редагування складського екрана" : "Новий складський екран"}
              </p>
              <button type="button" className="delete" aria-label="Закрити" onClick={close} />
            </header>
            <section className="modal-card-body">
              <label>
                Логін *
                <FormInput
                  value={form.login}
                  onChange={(event) => setForm({ ...form, login: event.target.value })}
                />
              </label>
              <label>
                Назва екрана *
                <FormInput
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                />
              </label>
              <label>
                {editingId ? "Новий пароль (якщо змінюється)" : "Пароль *"}
                <FormInput
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </label>
              <fieldset>
                <legend>Доступні склади *</legend>
                <div className={style.warehouseGrid}>
                  {warehouses.map((warehouse) => (
                    <label key={warehouse.id}>
                      <input
                        type="checkbox"
                        checked={form.warehouseIds.includes(warehouse.id)}
                        onChange={() => toggleWarehouse(warehouse.id)}
                      />
                      {warehouse.warehouseName}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className={style.activeToggle}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                />
                Обліковий запис активний
              </label>
            </section>
            <footer className="modal-card-foot">
              <button type="submit" className="button is-primary" disabled={saving}>
                {saving ? "Збереження…" : "Зберегти"}
              </button>
              <button type="button" className="button" onClick={close}>Скасувати</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
