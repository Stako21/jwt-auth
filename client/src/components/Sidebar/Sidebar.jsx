import React, { useState } from "react";
import { AuthClient } from "../../context/AuthContext";
import { enqueueSnackbar } from "notistack";
import style from "./sidebar.module.scss";

const defaultValues = {
  userName: "",
  password: "",
  role: 1, // Default role id
  city: 1, // Default city id
};

const rolesList = [
  { id: 1, title: "Адміністратор" },
  { id: 2, title: "Модератор" },
  { id: 3, title: "Користувач" },
];

const citiesList = [
  { id: 1, title: "Запоріжжя" },
  { id: 2, title: "Дніпро" },
  { id: 3, title: "Кривий Ріг" },
];

export const Sidebar = ({ user = null, onSaved = null, onCancel = null }) => {
  const [formValues, setFormValues] = useState(
    user
      ? {
          userName: user.name || "",
          password: "",
          role: user.role || 1,
          city: user.city || 1,
        }
      : defaultValues
  );

  // keep form values in sync when 'user' prop changes
  React.useEffect(() => {
    if (user) {
      setFormValues({
        userName: user.name || "",
        password: "",
        role: user.role || 1,
        city: user.city || 1,
      });
    } else {
      setFormValues(defaultValues);
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormValues({
      ...formValues,
      [name]: value,
    });
  };

  const handleRegister = () => {
    const { userName, password, role, city } = formValues;

    if (!userName || !password) {
      enqueueSnackbar("Будь ласка, заповніть всі поля", { variant: "error" });
      return;
    }

    // Формирование данных для запроса
    const data = { userName, password, role, city };

    AuthClient.post("/sign-up", data)
      .then(() => {
        enqueueSnackbar("Користувач успішно зареєстрований", {
          variant: "success",
        });
        setFormValues(defaultValues); // Сброс формы после успешної реєстрації
        if (onSaved) onSaved();
        onCancel();
      })
      .catch((error) => {
        console.error("Помилка реєстрації:", error);
        if (error.response && error.response.data) {
          enqueueSnackbar(error.response.data.message || "Помилка реєстрації", {
            variant: "error",
          });
        } else {
          enqueueSnackbar("Помилка реєстрації", { variant: "error" });
        }
      });
  };

  const handleUpdate = () => {
    if (!user) return;

    const { userName, role, city } = formValues;

    if (!userName) {
      enqueueSnackbar("Ім'я користувача обов'язкове", { variant: "error" });
      return;
    }

    AuthClient.put(`/users/${user.id}`, { userName, role, city })
      .then(() => {
        enqueueSnackbar("Користувача оновлено", { variant: "success" });
        if (onSaved) onSaved();
        onCancel();
      })
      .catch((error) => {
        console.error("Update error:", error);
        enqueueSnackbar("Помилка оновлення", { variant: "error" });
      });
  };

  return (
    <div className="modal is-active">
      <div class="modal-background"></div>
      <div className="modal-card">
        <header className="modal-card-head">
          {user ? (
            <div
              className="modal-card-title has-text-weight-medium"
              data-cy="modal-header"
            >
              Змінити данні користувача: {formValues.userName}
            </div>
          ) : (
            <div
              className="modal-card-title has-text-weight-medium"
              data-cy="modal-header"
            >
              Реєстрація
            </div>
          )}
        </header>

        <div className="modal-card-body">
          <div className="field">
            <label className="label">User name:</label>
            <div className="control">
              <input
                className="input"
                type="text"
                name="userName"
                value={formValues.userName}
                onChange={handleChange}
              />
            </div>
          </div>

          {!user && (
            <div className="field">
              <label className="label">Password:</label>
              <div className="control">
                <input
                  className="input"
                  type="text"
                  name="password"
                  value={formValues.password}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          <div className="field">
            <label className="label">Role:</label>
            <div className="control">
              <div className="select is-fullwidth">
                <select
                  name="role"
                  value={formValues.role}
                  onChange={handleChange}
                >
                  {rolesList.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="field">
            <label className="label">City:</label>
            <div className="control is-expanded">
              <div className="select is-fullwidth">
                <select
                  name="city"
                  value={formValues.city}
                  onChange={handleChange}
                >
                  {citiesList.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="field">
            {user ? (
              <div className="buttons ">
                <button
                  className="button is-success is-dark is-fullwidth"
                  onClick={handleUpdate}
                >
                  Update
                </button>
                <button
                  className="button is-danger is-dark is-fullwidth"
                  // style={{ marginLeft: 8 }}
                  onClick={() => onCancel && onCancel()}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="buttons">
                <button
                  className="button is-success is-fullwidth"
                  onClick={handleRegister}
                >
                  SignUp
                </button>
                <button
                  className="button is-danger is-dark is-fullwidth"
                  // style={{ marginLeft: 8 }}
                  onClick={() => onCancel && onCancel()}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
