import React, { useEffect, useState } from "react";
import { AuthClient } from "../../context/AuthContext";
import { enqueueSnackbar } from "notistack";
import style from "./sidebar.module.scss";
import { ROLE_OPTIONS } from "../../utils/roles";
import { UsersList } from "../UsersList/UsersList";
import axios from "axios";
import config from "../../config";
import { ROLE_IDS } from "../../utils/roles";

const defaultValues = {
  userName: "",
  user_name: "",
  password: "",
  role: 1, // Default role id
  city: 1, // Default city id
};

// replace local rolesList with ROLE_OPTIONS mapping
const rolesList = ROLE_OPTIONS.map(({ value, label }) => ({
  id: value,
  title: label,
}));

const citiesList = [
  { id: 1, title: "Запоріжжя" },
  { id: 2, title: "Дніпро" },
  { id: 3, title: "Кривий Ріг" },
];

export const Sidebar = ({ user = null, onSaved = null, onCancel = null }) => {
  const [users, setUsers] = useState([]);
  const [formValues, setFormValues] = useState(
    user
      ? {
          userName: user.name || "",
          user_name: user.user_name || "",
          password: "",
          role: user.role || 1,
          city: user.city || 1,
        }
      : defaultValues
  );

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${config.API_URL}/auth/users`);
        setUsers(response.data);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, [formValues.role]);
  // keep form values in sync when 'user' prop changes
  React.useEffect(() => {
    if (user) {
      setFormValues({
        userName: user.name || "",
        user_name: user.user_name || "",
        password: "",
        role: user.role || 1,
        city: user.city || 1,
        supervisorId: user.parent_user_id ?? null,
      });
    } else {
      setFormValues(defaultValues);
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const parsed = name === "role" || name === "city" ? Number(value) : value; // ensure numbers
    setFormValues({
      ...formValues,
      [name]: parsed,
    });
  };

  const handleRegister = () => {
    const { userName, user_name, password, role, city } = formValues;

    if (!userName || !password) {
      enqueueSnackbar("Будь ласка, заповніть всі поля", { variant: "error" });
      return;
    }

    // Формирование данных для запроса (user_name необязателен)
    const data = {
      userName,
      user_name,
      password,
      role: Number(role),
      city: Number(city),
    };

    AuthClient.post("/sign-up", data)
      .then(() => {
        enqueueSnackbar("Користувач успішно зареєстрований", {
          variant: "success",
        });
        setFormValues(defaultValues); // Сброс формы после успешної реєстрації
        if (onSaved) onSaved();
        if (onCancel) onCancel();
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

  const canHaveParent =
    formValues.role === ROLE_IDS.TA || formValues.role === ROLE_IDS.SV;

  const availableParents = users.filter((u) => {
    if (formValues.role === ROLE_IDS.TA) return u.role === ROLE_IDS.SV;
    if (formValues.role === ROLE_IDS.SV) return u.role === ROLE_IDS.NTO;
    return false;
  });

  // const handleUpdate = () => {
  //   if (!user) return;

  //   const { userName, user_name, role, city } = formValues;

  //   // userName and user_name are optional when updating
  //   AuthClient.put(`/users/${user.id}`, { userName, user_name, role, city })
  //     .then(() => {
  //       enqueueSnackbar("Користувача оновлено", { variant: "success" });
  //       if (onSaved) onSaved();
  //       onCancel();
  //     })
  //     .catch((error) => {
  //       console.error("Update error:", error);
  //       enqueueSnackbar("Помилка оновлення", { variant: "error" });
  //     });
  // };

  const handleUpdate = async () => {
    if (!user) return;

    const { userName, user_name, role, city, supervisorId } = formValues;

    try {
      // 1️⃣ обновляем самого пользователя
      await AuthClient.put(`/users/${user.id}`, {
        userName,
        user_name,
        role,
        city,
      });

      // 2️⃣ обновляем иерархию (ТОЛЬКО если есть право иметь руководителя)
      if (canHaveParent) {
        await AuthClient.put(`/users/${user.id}/supervisor`, {
          supervisorId: supervisorId ?? null,
        });
      }

      enqueueSnackbar("Користувача оновлено", { variant: "success" });
      if (onSaved) onSaved();
      onCancel();
    } catch (error) {
      console.error("Update error:", error);
      enqueueSnackbar("Помилка оновлення", { variant: "error" });
    }
  };

  return (
    <div className="modal is-active">
      <div className="modal-background"></div> {/* fixed className */}
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
            <label className="label">User name (login):</label>
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

          <div className="field">
            <label className="label">
              Display name (user_name) — optional:
            </label>
            <div className="control">
              <input
                className="input"
                type="text"
                name="user_name"
                value={formValues.user_name}
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

          {(formValues.role === 5 || formValues.role === 4) && (
            <div className="field">
              <label className="label">Team Head:</label>
              <div className="control">
                <div className="select is-fullwidth">
                  <select
                    value={formValues.supervisorId || ""}
                    onChange={(e) =>
                      setFormValues({
                        ...formValues,
                        supervisorId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">Без керівника</option>
                    {availableParents.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.user_name}
                      </option>
                    ))}
                  </select>
                  {/* <select name="Supervisor">
                    {users
                      .filter((u) => u.role === 4 || u.role === 3)
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                  </select> */}
                </div>
              </div>
            </div>
          )}

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
                  type="button"
                  className="button is-success is-fullwidth"
                  onClick={handleRegister}
                >
                  SignUp
                </button>
                <button
                  type="button"
                  className="button is-danger is-dark is-fullwidth"
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
