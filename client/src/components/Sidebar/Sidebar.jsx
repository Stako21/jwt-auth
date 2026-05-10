import React, { useEffect, useMemo, useState } from "react";
import { enqueueSnackbar } from "notistack";
import { AuthClient } from "../../context/AuthContext";
import {
  fetchUserAccessConfig,
  fetchUserAccessOptions,
  updateUserAccessConfig,
} from "../../services/config.api";
import { ROLE_IDS, ROLE_OPTIONS } from "../../utils/roles";
import { useAppConfig } from "../../context/AppConfigContext";

const defaultValues = {
  userName: "",
  user_name: "",
  password: "",
  role: 1,
  city: 1,
  supervisorId: null,
  branchAccessIds: [],
  cityAccessIds: [],
};

const rolesList = ROLE_OPTIONS.map(({ value, label }) => ({
  id: value,
  title: label,
}));

export const Sidebar = ({ user = null, onSaved = null, onCancel = null }) => {
  const { activeCities, appConfig } = useAppConfig();
  const [users, setUsers] = useState([]);
  const [accessOptions, setAccessOptions] = useState({
    branches: [],
    cities: [],
  });
  const [accessLoading, setAccessLoading] = useState(false);
  const [formValues, setFormValues] = useState(
    user
      ? {
          userName: user.name || "",
          user_name: user.user_name || "",
          password: "",
          role: user.role || 1,
          city: user.city || activeCities[0]?.id || 1,
          supervisorId: user.parent_user_id ?? null,
          branchAccessIds: [],
          cityAccessIds: [],
        }
      : {
          ...defaultValues,
          city: activeCities[0]?.id || 1,
        },
  );

  const currentBranchId = Number(user?.branch_id || appConfig?.branch?.id || 0);
  const canHaveParent =
    formValues.role === ROLE_IDS.TA || formValues.role === ROLE_IDS.SV;
  const canManageBranchAccess = [
    ROLE_IDS.Admin,
    ROLE_IDS.Director,
  ].includes(Number(formValues.role));
  const canManageCityAccess = [
    ROLE_IDS.Accountant,
    ROLE_IDS.Warehouse,
  ].includes(Number(formValues.role));

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await AuthClient.get("/users");
        setUsers(response.data);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, [formValues.role]);

  useEffect(() => {
    const loadAccessOptions = async () => {
      setAccessLoading(true);
      try {
        const data = await fetchUserAccessOptions();
        setAccessOptions({
          branches: data.branches || [],
          cities: data.cities || [],
        });
      } catch (error) {
        console.error("Failed to load user access options:", error);
      } finally {
        setAccessLoading(false);
      }
    };

    loadAccessOptions();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadUserAccess = async () => {
      if (!user) {
        setFormValues({
          ...defaultValues,
          city: activeCities[0]?.id || 1,
        });
        return;
      }

      setFormValues({
        userName: user.name || "",
        user_name: user.user_name || "",
        password: "",
        role: user.role || 1,
        city: user.city || activeCities[0]?.id || 1,
        supervisorId: user.parent_user_id ?? null,
        branchAccessIds: [],
        cityAccessIds: [],
      });

      try {
        setAccessLoading(true);
        const access = await fetchUserAccessConfig(user.id);

        if (!cancelled) {
          setAccessOptions((current) => ({
            branches: access.availableBranches?.length
              ? access.availableBranches
              : current.branches,
            cities: access.availableCities?.length
              ? access.availableCities
              : current.cities,
          }));
          setFormValues((current) => ({
            ...current,
            branchAccessIds: access.branchAccessIds || [],
            cityAccessIds: access.cityAccessIds || [],
          }));
        }
      } catch (error) {
        console.error("Failed to load user access:", error);
      } finally {
        if (!cancelled) {
          setAccessLoading(false);
        }
      }
    };

    loadUserAccess();

    return () => {
      cancelled = true;
    };
  }, [user, activeCities]);

  const availableParents = users.filter((u) => {
    if (formValues.role === ROLE_IDS.TA) return u.role === ROLE_IDS.SV;
    if (formValues.role === ROLE_IDS.SV) return u.role === ROLE_IDS.NTO;
    return false;
  });

  const cityWarningParent = availableParents.find(
    (parent) =>
      Number(parent.id) === Number(formValues.supervisorId) &&
      Number(parent.city) !== Number(formValues.city),
  );

  const branchOptions = useMemo(() => {
    return (accessOptions.branches || []).filter(
      (branch) => Number(branch.id) !== Number(currentBranchId),
    );
  }, [accessOptions.branches, currentBranchId]);

  const cityAccessOptions = useMemo(() => {
    const baseCities =
      accessOptions.cities?.length > 0 ? accessOptions.cities : activeCities;
    return baseCities.filter(
      (city) => Number(city.id) !== Number(formValues.city),
    );
  }, [accessOptions.cities, activeCities, formValues.city]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const parsed = name === "role" || name === "city" ? Number(value) : value;

    setFormValues((current) => ({
      ...current,
      [name]: parsed,
      ...(name === "city"
        ? {
            cityAccessIds: current.cityAccessIds.filter(
              (cityId) => Number(cityId) !== Number(parsed),
            ),
          }
        : {}),
    }));
  };

  const toggleAccessId = (field, id) => {
    setFormValues((current) => {
      const existing = current[field] || [];
      const next = existing.includes(id)
        ? existing.filter((item) => Number(item) !== Number(id))
        : [...existing, id];

      return {
        ...current,
        [field]: next,
      };
    });
  };

  const buildAccessPayload = () => ({
    branchAccessIds: canManageBranchAccess ? formValues.branchAccessIds : [],
    cityAccessIds: canManageCityAccess ? formValues.cityAccessIds : [],
  });

  const handleRegister = async () => {
    const {
      userName,
      user_name,
      password,
      role,
      city,
      supervisorId,
      branchAccessIds,
      cityAccessIds,
    } = formValues;

    if (!userName || !password) {
      enqueueSnackbar("Будь ласка, заповніть всі поля", {
        variant: "error",
      });
      return;
    }

    const data = {
      userName,
      user_name,
      password,
      role: Number(role),
      city: Number(city),
      supervisorId: canHaveParent && supervisorId ? Number(supervisorId) : null,
      branchAccessIds: canManageBranchAccess ? branchAccessIds : [],
      cityAccessIds: canManageCityAccess ? cityAccessIds : [],
    };

    try {
      await AuthClient.post("/sign-up", data);

      enqueueSnackbar("Користувача успішно зареєстровано", {
        variant: "success",
      });
      setFormValues({
        ...defaultValues,
        city: activeCities[0]?.id || 1,
      });
      if (onSaved) onSaved();
      if (onCancel) onCancel();
    } catch (error) {
      console.error("Помилка реєстрації:", error);
      if (error.response && error.response.data) {
        enqueueSnackbar(
          error.response.data.message ||
            error.response.data.error ||
            "Помилка реєстрації",
          {
            variant: "error",
          },
        );
      } else {
        enqueueSnackbar("Помилка реєстрації", { variant: "error" });
      }
    }
  };

  const handleUpdate = async () => {
    if (!user) return;

    const { userName, user_name, role, city, supervisorId } = formValues;

    try {
      await AuthClient.put(`/users/${user.id}`, {
        userName,
        user_name,
        role,
        city,
      });

      await updateUserAccessConfig(user.id, buildAccessPayload());

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
      enqueueSnackbar(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Помилка оновлення",
        { variant: "error" },
      );
    }
  };

  return (
    <div className="modal is-active">
      <div className="modal-background"></div>
      <div className="modal-card">
        <header className="modal-card-head">
          {user ? (
            <div
              className="modal-card-title has-text-weight-medium"
              data-cy="modal-header"
            >
              Змінити дані користувача: {formValues.userName}
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
            <label className="label">Логін користувача:</label>
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
              Відображуване ім'я (user_name), необов'язково:
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
              <label className="label">Пароль:</label>
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
            <label className="label">Роль:</label>
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

          {(formValues.role === ROLE_IDS.TA ||
            formValues.role === ROLE_IDS.SV) && (
            <div className="field">
              <label className="label">Керівник:</label>
              <div className="control">
                <div className="select is-fullwidth">
                  <select
                    value={formValues.supervisorId || ""}
                    onChange={(e) =>
                      setFormValues((current) => ({
                        ...current,
                        supervisorId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      }))
                    }
                  >
                    <option value="">Без керівника</option>
                    {availableParents.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.user_name}
                      </option>
                    ))}
                  </select>
                </div>
                {cityWarningParent && (
                  <p className="help is-warning">
                    Місто керівника відрізняється від міста користувача
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="field">
            <label className="label">Місто:</label>
            <div className="control is-expanded">
              <div className="select is-fullwidth">
                <select
                  name="city"
                  value={formValues.city}
                  onChange={handleChange}
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

          {canManageBranchAccess && (
            <div className="field">
              <label className="label">Доступ до філій</label>
              <div className="content is-small mb-2">
                <p>
                  Основна філія:{" "}
                  <strong>{appConfig?.branch?.name || "-"}</strong>
                </p>
              </div>
              {accessLoading ? (
                <p className="help">Завантаження...</p>
              ) : branchOptions.length ? (
                branchOptions.map((branch) => (
                  <label key={branch.id} className="checkbox is-block mb-2">
                    <input
                      type="checkbox"
                      checked={formValues.branchAccessIds.includes(branch.id)}
                      onChange={() => toggleAccessId("branchAccessIds", branch.id)}
                    />{" "}
                    {branch.name} ({branch.shortName || branch.slug})
                  </label>
                ))
              ) : (
                <p className="help">Додаткові філії відсутні</p>
              )}
            </div>
          )}

          {canManageCityAccess && (
            <div className="field">
              <label className="label">Доступ до міст</label>
              <div className="content is-small mb-2">
                <p>
                  Основне місто:{" "}
                  <strong>
                    {activeCities.find(
                      (city) => Number(city.id) === Number(formValues.city),
                    )?.name || "-"}
                  </strong>
                </p>
              </div>
              {accessLoading ? (
                <p className="help">Завантаження...</p>
              ) : cityAccessOptions.length ? (
                cityAccessOptions.map((city) => (
                  <label key={city.id} className="checkbox is-block mb-2">
                    <input
                      type="checkbox"
                      checked={formValues.cityAccessIds.includes(city.id)}
                      onChange={() => toggleAccessId("cityAccessIds", city.id)}
                    />{" "}
                    {city.name}
                  </label>
                ))
              ) : (
                <p className="help">Додаткові міста відсутні</p>
              )}
            </div>
          )}

          <div className="field">
            {user ? (
              <div className="buttons ">
                <button
                  className="button is-success is-dark is-fullwidth"
                  onClick={handleUpdate}
                >
                  Оновити
                </button>
                <button
                  className="button is-danger is-dark is-fullwidth"
                  onClick={() => onCancel && onCancel()}
                >
                  Скасувати
                </button>
              </div>
            ) : (
              <div className="buttons">
                <button
                  type="button"
                  className="button is-success is-fullwidth"
                  onClick={handleRegister}
                >
                  Зареєструвати
                </button>
                <button
                  type="button"
                  className="button is-danger is-dark is-fullwidth"
                  onClick={() => onCancel && onCancel()}
                >
                  Скасувати
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
