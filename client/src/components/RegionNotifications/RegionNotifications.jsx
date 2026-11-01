import { useContext, useEffect, useState } from "react";
import FormInput from "../FormControl/FormInput.jsx";
import CompactSelect from "../CompactSelect/CompactSelect.jsx";
import { useSnackbar } from "notistack";
import {
  fetchRegionNotifications, fetchNotificationOptions, sendTestNotification,
  createRegionNotification, updateRegionNotification, deleteRegionNotification,
} from "../../services/regionNotifications.api";
import styles from "./RegionNotifications.module.scss";
import { useAppConfig } from "../../context/AppConfigContext";
import { AuthContext } from "../../context/AuthContext";
import { DataLoader } from "../DataLoader/DataLoader";

const emptyForm = (city = "", options = null) => ({
  city, email: "", rocket_channel: "", is_active: true,
  document_groups: [...(options?.defaults.document_groups || [])],
  tro_events: [...(options?.defaults.tro_events || [])],
});
const emailValid = (value) => !value || /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const channelValid = (value) => !value || /^#?[\p{L}\p{N}][\p{L}\p{N}._-]{0,99}$/u.test(value);

export function RegionNotifications() {
  const { enqueueSnackbar } = useSnackbar();
  const { cities, activeCities } = useAppConfig();
  const { userInfo } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [testResult, setTestResult] = useState(null);
  const busy = saving || testing;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setNotifications([]);
    setOptions(null);
    setFormData(emptyForm());
    setValidationError("");
    setEditingId(null);
    setTestResult(null);
    Promise.all([fetchRegionNotifications(), fetchNotificationOptions()])
      .then(([rows, schema]) => {
        if (!active) return;
        setNotifications(rows);
        setOptions(schema);
        setFormData(emptyForm("", schema));
      })
      .catch((error) => {
        if (active) setLoadError(error.response?.data?.error || "Не вдалося завантажити налаштування");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userInfo?.branchId]);

  useEffect(() => {
    if (!activeCities.length) return;
    setFormData((current) => current.city ? current : { ...current, city: activeCities[0].id });
  }, [activeCities, options]);

  const change = (values) => {
    setFormData((current) => ({ ...current, ...values }));
    setValidationError("");
    setTestResult(null);
  };
  const toggle = (field, value) => setFormData((current) => ({
    ...current,
    [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value],
  }));
  const destination = () => ({
    city: Number(formData.city), email: formData.email.trim(), rocket_channel: formData.rocket_channel.trim(),
  });
  const validate = (testOnly = false) => {
    const values = destination();
    let problem = "";
    if (!values.city) problem = "Оберіть місто";
    else if (!values.email && !values.rocket_channel) problem = "Вкажіть email або Rocket.Chat канал";
    else if (values.email.length > 254 || !emailValid(values.email)) problem = "Вкажіть коректну email-адресу";
    else if (!channelValid(values.rocket_channel)) problem = "Некоректна назва Rocket.Chat каналу";
    else if (!testOnly && formData.is_active && !formData.document_groups.length) problem = "Оберіть хоча б одну групу документів";
    else if (!testOnly && formData.is_active && formData.document_groups.includes("TRO") && !formData.tro_events.length) problem = "Оберіть хоча б одну подію ТРО або вимкніть групу ТРО";
    setValidationError(problem);
    return !problem;
  };
  const resetForm = () => {
    setFormData(emptyForm(activeCities[0]?.id || "", options));
    setEditingId(null);
    setValidationError("");
    setTestResult(null);
  };
  async function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...destination(), is_active: formData.is_active, document_groups: formData.document_groups, tro_events: formData.tro_events };
      if (editingId) await updateRegionNotification(editingId, payload);
      else await createRegionNotification(payload);
      setNotifications(await fetchRegionNotifications());
      resetForm();
      enqueueSnackbar("Налаштування збережено", { variant: "success" });
    } catch (error) {
      setValidationError(error.response?.data?.error || "Не вдалося зберегти налаштування");
    } finally { setSaving(false); }
  }
  async function handleTest() {
    if (!validate(true)) return;
    setTesting(true);
    setTestResult(null);
    try { setTestResult(await sendTestNotification(destination())); } catch (error) {
      setValidationError(error.response?.data?.error || "Не вдалося виконати тест");
    } finally { setTesting(false); }
  }
  async function handleDelete(id) {
    if (!window.confirm("Видалити налаштування сповіщень?")) return;
    setSaving(true);
    try {
      await deleteRegionNotification(id);
      setNotifications(await fetchRegionNotifications());
      if (editingId === id) resetForm();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || "Не вдалося видалити налаштування", { variant: "error" });
    } finally { setSaving(false); }
  }
  const edit = (row) => {
    setEditingId(row.id);
    setFormData({ ...row, email: row.email || "", rocket_channel: row.rocket_channel || "", is_active: Boolean(row.is_active) });
    setValidationError("");
    setTestResult(null);
  };
  const cityName = (cityId) => cities.find((city) => Number(city.id) === Number(cityId))?.name || "—";
  const labels = (items, selected) => items.filter((item) => selected.includes(item.value)).map((item) => item.label).join(", ");
  if (loading) return <DataLoader label="Завантаження налаштувань сповіщень…" />;

  return (
    <div className={styles.container}>
      {loadError ? <p className={styles.error} role="alert">{loadError}</p> : null}
      <div className={styles.layout}>
        <section className={styles.listPanel}>
          <h3 className={styles.title}>Поточні налаштування</h3>
          {!notifications.length ? <p>Налаштувань ще немає</p> : (
            <div className="table-container">
              <table className={`${styles.table} table is-fullwidth`}>
                <thead><tr><th>Місто</th><th>Email / Rocket.Chat</th><th>Типи документів</th><th>Події ТРО</th><th>Активна</th><th>Дії</th></tr></thead>
                <tbody>{notifications.map((row) => (
                  <tr key={row.id}>
                    <td>{cityName(row.city)}</td>
                    <td className={styles.smallText}><div>{row.email || "—"}</div><div>{row.rocket_channel || "—"}</div></td>
                    <td className={styles.smallText}>{labels(options?.document_groups || [], row.document_groups)}</td>
                    <td className={styles.smallText}>{row.document_groups.includes("TRO") ? labels(options?.tro_events || [], row.tro_events) : "—"}</td>
                    <td>{row.is_active ? "Так" : "Ні"}</td>
                    <td><div className={styles.actionButtons}>
                      <button type="button" disabled={busy} onClick={() => edit(row)} aria-label="Редагувати налаштування" title="Редагувати"><i className="fa-solid fa-pen" aria-hidden="true" /></button>
                      <button type="button" disabled={busy} onClick={() => handleDelete(row.id)} aria-label="Видалити налаштування" title="Видалити"><i className="fa-solid fa-trash" aria-hidden="true" /></button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className={styles.formPanel}>
          <h3 className={styles.title}>{editingId ? "Редагування" : "Додавання налаштування"}</h3>
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}><span>Місто *</span>
              <CompactSelect value={formData.city} disabled={busy || !options} ariaLabel="Місто сповіщення" placeholder="Оберіть місто"
                options={cities.filter((city) => city.isActive || Number(city.id) === Number(formData.city)).map((city) => ({ value: city.id, label: city.name }))}
                onChange={(value) => change({ city: Number(value) })} />
            </div>
            <label className={styles.field}><span>Email</span>
              <FormInput type="email" placeholder="example@mail.com" value={formData.email} disabled={busy}
                hasError={Boolean(validationError) && !emailValid(formData.email.trim())}
                onChange={(event) => change({ email: event.target.value })} />
            </label>
            <label className={styles.field}><span>Rocket.Chat канал</span>
              <FormInput placeholder="#channel-name" value={formData.rocket_channel} disabled={busy}
                hasError={Boolean(validationError) && !channelValid(formData.rocket_channel.trim())}
                onChange={(event) => change({ rocket_channel: event.target.value })} />
            </label>
            <fieldset className={styles.choices} disabled={busy || !options}>
              <legend>Типи документів</legend>
              {(options?.document_groups || []).map((group) => (
                <label key={group.value}><FormInput type="checkbox" checked={formData.document_groups.includes(group.value)}
                  onChange={() => toggle("document_groups", group.value)} /><span>{group.label}</span></label>
              ))}
            </fieldset>
            <fieldset className={styles.choices} disabled={busy || !formData.document_groups.includes("TRO")}>
              <legend>Події ТРО</legend>
              {(options?.tro_events || []).map((event) => (
                <label key={event.value}><FormInput type="checkbox" checked={formData.tro_events.includes(event.value)}
                  onChange={() => toggle("tro_events", event.value)} /><span>{event.label}</span></label>
              ))}
            </fieldset>
            <label className={styles.activeChoice}><FormInput type="checkbox" checked={formData.is_active} disabled={busy}
              onChange={(event) => change({ is_active: event.target.checked })} /><span>Активна</span></label>
            {validationError ? <p className={styles.error} role="alert">{validationError}</p> : null}
            <div className={styles.formActions}>
              <button type="submit" className={styles.primary} disabled={busy || !options || Boolean(loadError)}>{saving ? "Збереження…" : editingId ? "Оновити" : "Додати"}</button>
              <button type="button" disabled={busy || !options || Boolean(loadError)} onClick={handleTest}>{testing ? "Надсилання…" : "Надіслати тест"}</button>
              {editingId ? <button type="button" disabled={busy} onClick={resetForm}>Скасувати</button> : null}
            </div>
            <p className={styles.help}>Тест використовує поточні адреси форми та не зберігає налаштування.</p>
            {testResult ? <div className={styles.testResults} role="status" aria-live="polite">
              {[["email", "Email"], ["rocket", "Rocket.Chat"]].map(([key, label]) => testResult[key] ? (
                <p key={key} className={testResult[key].success ? styles.success : styles.error}>{label} — {testResult[key].message}</p>
              ) : null)}
            </div> : null}
          </form>
        </section>
      </div>
    </div>
  );
}
