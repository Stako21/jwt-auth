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
        setFormValues(defaultValues); // Сброс формы после успешной регистрации
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
      })
      .catch((error) => {
        console.error("Update error:", error);
        enqueueSnackbar("Помилка оновлення", { variant: "error" });
      });
  };

  return (
    <div className={style.registration}>
      <h3>Реєстрація</h3>
      <div>
        <label>User name:</label>
        <input
          type="text"
          name="userName"
          value={formValues.userName}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Password:</label>
        <input
          type="text"
          name="password"
          value={formValues.password}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Role:</label>
        <select name="role" value={formValues.role} onChange={handleChange}>
          {rolesList.map((role) => (
            <option key={role.id} value={role.id}>
              {role.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>City:</label>
        <select name="city" value={formValues.city} onChange={handleChange}>
          {citiesList.map((city) => (
            <option key={city.id} value={city.id}>
              {city.title}
            </option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: 10 }}>
        {user ? (
          <>
            <button className={style.sidebarBooton} onClick={handleUpdate}>
              Update
            </button>
            <button
              style={{ marginLeft: 8 }}
              onClick={() => onCancel && onCancel()}
            >
              Cancel
            </button>
          </>
        ) : (
          <button className={style.sidebarBooton} onClick={handleRegister}>
            SignUp
          </button>
        )}
      </div>
    </div>
  );
};
