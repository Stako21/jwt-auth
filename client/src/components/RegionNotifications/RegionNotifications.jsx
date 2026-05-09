import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import {
  fetchRegionNotifications,
  createRegionNotification,
  updateRegionNotification,
  deleteRegionNotification,
} from "../../services/regionNotifications.api";
import styles from "./RegionNotifications.module.scss";
import { useAppConfig } from "../../context/AppConfigContext";

export function RegionNotifications() {
  const { enqueueSnackbar } = useSnackbar();
  const { cities, activeCities } = useAppConfig();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    city: activeCities[0]?.id || 1,
    email: "",
    rocket_channel: "",
    is_active: true,
  });

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (!activeCities.length) return;

    setFormData((current) => {
      const cityExists = activeCities.some(
        (city) => Number(city.id) === Number(current.city),
      );

      return cityExists ? current : { ...current, city: activeCities[0].id };
    });
  }, [activeCities]);

  async function loadNotifications() {
    try {
      setLoading(true);
      const data = await fetchRegionNotifications();
      setNotifications(data);
    } catch (error) {
      console.error("Error loading notifications:", error);
      enqueueSnackbar("Помилка завантаження налаштувань", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.email && !formData.rocket_channel) {
      enqueueSnackbar("Вкажіть email або Rocket канал", { variant: "warning" });
      return;
    }

    try {
      if (editingId) {
        await updateRegionNotification(editingId, formData);
        enqueueSnackbar("Налаштування оновлено", { variant: "success" });
      } else {
        await createRegionNotification(formData);
        enqueueSnackbar("Налаштування додано", { variant: "success" });
      }

      resetForm();
      loadNotifications();
    } catch (error) {
      console.error("Error saving notification:", error);
      enqueueSnackbar("Помилка збереження", { variant: "error" });
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Ви впевнені?")) return;

    try {
      await deleteRegionNotification(id);
      enqueueSnackbar("Налаштування видалено", { variant: "success" });
      loadNotifications();
    } catch (error) {
      console.error("Error deleting notification:", error);
      enqueueSnackbar("Помилка видалення", { variant: "error" });
    }
  }

  function handleEdit(notification) {
    setFormData(notification);
    setEditingId(notification.id);
  }

  function resetForm() {
    setFormData({
      city: activeCities[0]?.id || 1,
      email: "",
      rocket_channel: "",
      is_active: true,
    });
    setEditingId(null);
  }

  const cityName = (cityId) =>
    cities.find((c) => Number(c.id) === Number(cityId))?.name || cityId;

  if (loading) {
    return <div className="has-text-centered mt-5">Завантаження...</div>;
  }

  return (
    <div className={styles.container}>
      <div className="columns">
        {/* Таблиця */}
        <div className="column is-7">
          <h3 className="title is-5">Поточні налаштування</h3>
          {notifications.length === 0 ? (
            <p className="has-text-grey">Налаштувань ще немає</p>
          ) : (
            <div className="table-container">
              <table className="table is-fullwidth is-bordered is-striped is-narrow">
                <thead>
                  <tr>
                    <th>Місто</th>
                    <th>Email</th>
                    <th>Rocket Channel</th>
                    <th>Активна</th>
                    <th>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((notif) => (
                    <tr key={notif.id}>
                      <td>{cityName(notif.city)}</td>
                      <td className={styles.smallText}>{notif.email || "—"}</td>
                      <td className={styles.smallText}>
                        {notif.rocket_channel || "—"}
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            notif.is_active ? "is-success" : "is-danger"
                          }`}
                        >
                          {notif.is_active ? "Так" : "Ні"}
                        </span>
                      </td>
                      <td className={styles.actionButtons}>
                        <button
                          className="button is-small is-info ml-1"
                          onClick={() => handleEdit(notif)}
                        >
                          <i class="fas fa-pen"></i>
                        </button>
                        <button
                          className="button is-small is-danger ml-1"
                          onClick={() => handleDelete(notif.id)}
                        >
                          <i class="fa-solid fa-xmark"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Форма */}
        <div className="column is-5">
          <h3 className="title is-5">
            {editingId ? "Редагування" : "Додавання налаштування"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="label">Місто *</label>
              <div className="control">
                <div className="select is-fullwidth">
                  <select
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: Number(e.target.value) })
                    }
                  >
                    {activeCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="label">Email</label>
              <div className="control">
                <input
                  className="input"
                  type="email"
                  placeholder="example@mail.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Rocket.Chat канал</label>
              <div className="control">
                <input
                  className="input"
                  type="text"
                  placeholder="#channel-name"
                  value={formData.rocket_channel}
                  onChange={(e) =>
                    setFormData({ ...formData, rocket_channel: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="field">
              <div className="control">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                  />
                  <span className="ml-2">Активна</span>
                </label>
              </div>
            </div>

            <div className="field is-grouped">
              <div className="control">
                <button
                  type="submit"
                  className="button is-primary is-fullwidth"
                >
                  {editingId ? "Оновити" : "Додати"}
                </button>
              </div>
              {editingId && (
                <div className="control">
                  <button
                    type="button"
                    className="button is-light is-fullwidth"
                    onClick={resetForm}
                  >
                    Скасувати
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
