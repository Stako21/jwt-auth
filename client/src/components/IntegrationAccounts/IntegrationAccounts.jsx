import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import FormInput from "../FormControl/FormInput.jsx";
import { createIntegrationAccount, fetchIntegrationAccounts, updateIntegrationAccount } from "../../services/integrationAccounts.api.js";
import style from "./IntegrationAccounts.module.scss";

const emptyForm = { login: "", password: "", display_name: "", issued_to_name: "", is_active: true, can_process_requests: true, can_sync_statuses: false, city_ids: [] };
const formatDate = (value) => value ? new Date(value).toLocaleString("uk-UA") : "—";

export function IntegrationAccounts() {
  const { enqueueSnackbar } = useSnackbar();
  const [accounts, setAccounts] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const load = async () => {
    setLoading(true);
    try { const data = await fetchIntegrationAccounts(); setAccounts(data.accounts || []); setCities(data.cities || []); }
    catch (error) { console.error(error); enqueueSnackbar("Не вдалося завантажити технічні облікові записи", { variant: "error" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditingId(null); setForm({ ...emptyForm, city_ids: [] }); setEditorOpen(true); };
  const openEdit = (account) => {
    setEditingId(account.id);
    setForm({ login: account.login, password: "", display_name: account.display_name || "", issued_to_name: account.issued_to_name || "", is_active: account.is_active, can_process_requests: account.can_process_requests, can_sync_statuses: account.can_sync_statuses, city_ids: account.cities.map((city) => city.id) });
    setEditorOpen(true);
  };
  const close = () => { setEditorOpen(false); setEditingId(null); setForm(emptyForm); };
  const toggleCity = (id) => setForm((current) => ({ ...current, city_ids: current.city_ids.includes(id) ? current.city_ids.filter((cityId) => cityId !== id) : [...current.city_ids, id] }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      if (editingId) await updateIntegrationAccount(editingId, form); else await createIntegrationAccount(form);
      enqueueSnackbar("Технічний обліковий запис збережено", { variant: "success" }); close(); await load();
    } catch (error) { enqueueSnackbar(error?.response?.data?.error?.message || "Не вдалося зберегти обліковий запис", { variant: "error" }); }
    finally { setSaving(false); }
  };
  return <div className={style.workspace}>
    <div className={style.toolbar}><div><h2>Технічні облікові записи</h2><p>Окремі доступи для обробок 1С. Перетин міст дозволено.</p></div><button type="button" className="button is-primary" onClick={openNew}>Створити запис</button></div>
    <div className="table-container"><table className="table is-fullwidth"><thead><tr><th>Логін</th><th>Назва / кому видано</th><th>Міста</th><th>Права</th><th>Активність</th><th /></tr></thead><tbody>
      {loading && <tr><td colSpan="6">Завантаження…</td></tr>}
      {!loading && !accounts.length && <tr><td colSpan="6">Технічних облікових записів ще немає</td></tr>}
      {accounts.map((account) => <tr key={account.id}><td><strong>{account.login}</strong></td><td>{account.display_name}<small>{account.issued_to_name || "—"}</small></td><td>{account.cities.map((city) => city.name).join(", ") || "—"}</td><td>{[account.can_process_requests && "Заявки", account.can_sync_statuses && "Статуси"].filter(Boolean).join(" · ")}</td><td><span className={account.is_active ? style.active : style.inactive}>{account.is_active ? "Активний" : "Вимкнений"}</span><small>Вхід: {formatDate(account.last_login_at)}</small></td><td><button type="button" className="button is-small" onClick={() => openEdit(account)}>Редагувати</button></td></tr>)}
    </tbody></table></div>
    {editorOpen && <div className="modal is-active admin-modal"><div className="modal-background" onClick={close} /><form className={`modal-card ${style.modalCard}`} onSubmit={save}>
      <header className="modal-card-head"><p className="modal-card-title">{editingId ? "Редагування технічного запису" : "Новий технічний запис"}</p><button type="button" className="delete" aria-label="Закрити" onClick={close} /></header>
      <section className="modal-card-body">
        <label>Логін *<FormInput value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} /></label><label>Назва *<FormInput value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label>
        <label>Кому видано<FormInput value={form.issued_to_name} onChange={(event) => setForm({ ...form, issued_to_name: event.target.value })} /></label><label>{editingId ? "Новий пароль (якщо змінюється)" : "Пароль *"}<FormInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <fieldset><legend>Права інтеграції</legend><label><input type="checkbox" checked={form.can_process_requests} onChange={(event) => setForm({ ...form, can_process_requests: event.target.checked })} /> Отримання та обробка заявок</label><label><input type="checkbox" checked={form.can_sync_statuses} onChange={(event) => setForm({ ...form, can_sync_statuses: event.target.checked })} /> Оновлення статусів</label></fieldset>
        <fieldset><legend>Міста *</legend><div className={style.cityGrid}>{cities.map((city) => <label key={city.id}><input type="checkbox" checked={form.city_ids.includes(city.id)} onChange={() => toggleCity(city.id)} /> {city.name}<small>{city.branch_name}</small></label>)}</div></fieldset>
        <label className={style.activeToggle}><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Обліковий запис активний</label>
      </section><footer className="modal-card-foot"><button type="submit" className="button is-primary" disabled={saving}>{saving ? "Збереження…" : "Зберегти"}</button><button type="button" className="button" onClick={close}>Скасувати</button></footer>
    </form></div>}
  </div>;
}
