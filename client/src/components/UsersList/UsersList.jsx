import React, { useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import style from "./UsersList.module.scss";
import { ROLE_IDS, ROLE_LABELS } from "../../utils/roles";
import { useAppConfig } from "../../context/AppConfigContext";
import { AuthClient } from "../../context/AuthContext";

const HIERARCHY_ROLES = new Set([ROLE_IDS.NTO, ROLE_IDS.SV, ROLE_IDS.TA]);

export const UsersList = ({
  onUserSelect,
  onEditUser,
  reloadKey = 0,
  onCreateUser,
}) => {
  const { cities } = useAppConfig();
  const { enqueueSnackbar } = useSnackbar();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [viewMode, setViewMode] = useState("list");
  const [detachingUserId, setDetachingUserId] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "fullName",
    direction: "asc",
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await AuthClient.get("/users/tree");
        setUsers(response.data);
      } catch (error) {
        console.error("Error fetching users:", error);
        enqueueSnackbar("Не вдалося завантажити користувачів", {
          variant: "error",
        });
      }
    };

    fetchUsers();
  }, [enqueueSnackbar, reloadKey]);

  const displayName = (user) => user.user_name || user.name;

  const compareUsers = (a, b) => {
    const getSortValue = (user, key) => {
      if (key === "id") return Number(user.id) || 0;
      if (key === "name") return String(user.name || "").toLowerCase();
      if (key === "fullName") {
        return String(displayName(user) || "").toLowerCase();
      }
      return "";
    };

    const aValue = getSortValue(a, sortConfig.key);
    const bValue = getSortValue(b, sortConfig.key);

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
    }

    const result = String(aValue).localeCompare(String(bValue));
    return sortConfig.direction === "asc" ? result : -result;
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort(compareUsers);
  }, [users, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return { key, direction: "asc" };
    });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return "";
    return sortConfig.direction === "asc" ? " ↑" : " ↓";
  };

  const filteredUsers = useMemo(() => {
    return sortedUsers.filter((user) => {
      const normalizedQuery = searchQuery.toLowerCase().trim();
      if (!normalizedQuery) return true;

      const normalizedName = String(user.name || "").toLowerCase();
      const normalizedFullName = String(displayName(user) || "").toLowerCase();

      if (searchField === "name") {
        return normalizedName.includes(normalizedQuery);
      }

      if (searchField === "fullName") {
        return normalizedFullName.includes(normalizedQuery);
      }

      return (
        normalizedName.includes(normalizedQuery) ||
        normalizedFullName.includes(normalizedQuery)
      );
    });
  }, [searchField, searchQuery, sortedUsers]);

  const filteredIds = useMemo(() => {
    return new Set(filteredUsers.map((user) => Number(user.id)));
  }, [filteredUsers]);

  const childrenByParent = useMemo(() => {
    const map = new Map();

    sortedUsers.forEach((user) => {
      const parentId = Number(user.parent_user_id);
      if (!parentId) return;

      if (!map.has(parentId)) {
        map.set(parentId, []);
      }

      map.get(parentId).push(user);
    });

    return map;
  }, [sortedUsers]);

  const cityLabel = useMemo(() => {
    return cities.reduce((acc, city) => {
      acc[city.id] = city.shortName || city.name;
      return acc;
    }, {});
  }, [cities]);

  const hierarchyVisibility = useMemo(() => {
    const cache = new Map();

    const hasVisibleNode = (user) => {
      const userId = Number(user.id);
      if (cache.has(userId)) {
        return cache.get(userId);
      }

      const children = childrenByParent.get(userId) || [];
      const isVisible =
        filteredIds.has(userId) || children.some((child) => hasVisibleNode(child));

      cache.set(userId, isVisible);
      return isVisible;
    };

    return { hasVisibleNode };
  }, [childrenByParent, filteredIds]);

  const hierarchyRoots = useMemo(() => {
    return {
      ntos: sortedUsers.filter(
        (user) => user.role === ROLE_IDS.NTO && !Number(user.parent_user_id),
      ),
      orphanSupervisors: sortedUsers.filter(
        (user) => user.role === ROLE_IDS.SV && !Number(user.parent_user_id),
      ),
      orphanAgents: sortedUsers.filter(
        (user) => user.role === ROLE_IDS.TA && !Number(user.parent_user_id),
      ),
      others: sortedUsers.filter((user) => !HIERARCHY_ROLES.has(Number(user.role))),
    };
  }, [sortedUsers]);

  const getHierarchyChildren = (user) => {
    const rawChildren = childrenByParent.get(Number(user.id)) || [];

    if (user.role === ROLE_IDS.NTO) {
      return rawChildren.filter((child) => Number(child.role) === ROLE_IDS.SV);
    }

    if (user.role === ROLE_IDS.SV) {
      return rawChildren.filter((child) => Number(child.role) === ROLE_IDS.TA);
    }

    return [];
  };

  const confirmDelete = (user) => {
    setUserToDelete(user);
    setIsModalOpen(true);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      await AuthClient.delete(`/users/${userToDelete.id}`);
      setUsers((current) =>
        current.filter((user) => Number(user.id) !== Number(userToDelete.id)),
      );
      enqueueSnackbar("Користувача деактивовано", { variant: "success" });
    } catch (error) {
      console.error(`Error deleting user ${userToDelete.name}:`, error);
      enqueueSnackbar(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Не вдалося деактивувати користувача",
        { variant: "error" },
      );
    } finally {
      setIsModalOpen(false);
      setUserToDelete(null);
    }
  };

  const handleDetachSupervisor = async (user) => {
    if (!user?.id || Number(user.role) !== ROLE_IDS.TA || !user.parent_user_id) {
      return;
    }

    setDetachingUserId(Number(user.id));
    try {
      await AuthClient.put(`/users/${user.id}/supervisor`, {
        supervisorId: null,
      });
      setUsers((current) =>
        current.map((item) =>
          Number(item.id) === Number(user.id)
            ? { ...item, parent_user_id: null }
            : item,
        ),
      );
      enqueueSnackbar("TA відв'язано від керівника", { variant: "success" });
    } catch (error) {
      console.error(`Error detaching TA ${user.id} from supervisor:`, error);
      enqueueSnackbar(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Не вдалося відв'язати TA від керівника",
        { variant: "error" },
      );
    } finally {
      setDetachingUserId(null);
    }
  };

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
    onUserSelect(userId);
  };

  const getRowStyle = (user) => {
    if (user.role === ROLE_IDS.TA && user.parent_user_id) {
      return { backgroundColor: "#0f3d2e99" };
    }

    if (user.role === ROLE_IDS.SV && user.parent_user_id) {
      return { backgroundColor: "#4a3f0b99" };
    }

    return {};
  };

  const renderUserRow = (user, { indentLevel = 0 } = {}) => {
    const canDetachFromSupervisor =
      Number(user.role) === ROLE_IDS.TA && Boolean(user.parent_user_id);

    return (
      <tr key={user.id} style={getRowStyle(user)}>
        <td>
          <button
            className="button is-warning is-dark is-small"
            type="button"
            name="selectedUser"
            aria-pressed={selectedUserId === user.id}
            onClick={() => handleSelectUser(user.id)}
            title="Змінити пароль"
          >
            <i className="fa-solid fa-wrench"></i>
          </button>
        </td>
        <td>{user.id}</td>
        <td>{user.name}</td>
        <td>
          <div style={{ paddingLeft: `${indentLevel * 24}px` }}>
            {indentLevel > 0 ? (
              <span className="has-text-grey mr-2">{indentLevel === 1 ? "↳" : "↳↳"}</span>
            ) : null}
            {user.user_name}
          </div>
        </td>
        <td>{cityLabel[user.city]}</td>
        <td>{ROLE_LABELS[user.role] || user.role}</td>
        <td>
          <button
            type="button"
            className="button is-info is-dark is-small"
            onClick={() => onEditUser && onEditUser(user)}
            title="Редагувати"
            aria-label={`edit-${user.id}`}
          >
            <i className="fa-solid fa-pen"></i>
          </button>
        </td>
        <td>
          {canDetachFromSupervisor ? (
            <button
              type="button"
              className={`button is-link is-dark is-small ${
                detachingUserId === Number(user.id) ? "is-loading" : ""
              }`}
              onClick={() => handleDetachSupervisor(user)}
              title="Відв'язати від керівника"
              aria-label={`detach-${user.id}`}
              disabled={detachingUserId === Number(user.id)}
            >
              <i className="fa-solid fa-link-slash"></i>
            </button>
          ) : (
            <span className="has-text-grey">—</span>
          )}
        </td>
        <td>
          <button
            type="button"
            className="button is-danger is-dark is-small"
            onClick={() => confirmDelete(user)}
            title="Видалити"
            aria-label={`delete-${user.id}`}
          >
            <i className="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    );
  };

  const renderFlatRows = () => {
    return filteredUsers.map((user) => {
      const subordinateNames = (childrenByParent.get(Number(user.id)) || []).map(
        (child) => child.user_name,
      );

      return (
        <React.Fragment key={`flat-${user.id}`}>
          {renderUserRow(user)}
          {(Number(user.role) === ROLE_IDS.SV || Number(user.role) === ROLE_IDS.NTO) && (
            <tr style={{ backgroundColor: "#262b33" }}>
              <td colSpan="9">
                {subordinateNames.length ? (
                  subordinateNames.map((name) => <div key={`${user.id}-${name}`}>• {name}</div>)
                ) : (
                  <div style={{ opacity: 0.6 }}>Немає підлеглих</div>
                )}
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  const renderHierarchyNode = (user, indentLevel = 0) => {
    if (!hierarchyVisibility.hasVisibleNode(user)) {
      return null;
    }

    const children = getHierarchyChildren(user).filter((child) =>
      hierarchyVisibility.hasVisibleNode(child),
    );

    return (
      <React.Fragment key={`tree-${user.id}`}>
        {renderUserRow(user, { indentLevel })}
        {children.map((child) => renderHierarchyNode(child, indentLevel + 1))}
      </React.Fragment>
    );
  };

  const renderHierarchySection = (title, rows, emptyMessage = null) => {
    const visibleRows = rows.filter((user) => hierarchyVisibility.hasVisibleNode(user));

    if (!visibleRows.length) {
      if (!emptyMessage) return null;

      return (
        <div className="notification is-dark is-light mb-3">
          <strong>{title}:</strong> {emptyMessage}
        </div>
      );
    }

    return (
      <div className="mb-5">
        <h4 className="title is-6 mb-2">{title}</h4>
        <table className="table is-bordered is-striped is-narrow is-hoverable is-fullwidth">
          <thead>
            <tr>
              <th className="has-text-centered">Пароль</th>
              <th
                className="has-text-centered"
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("id")}
              >
                ID{getSortIndicator("id")}
              </th>
              <th
                className="has-text-centered"
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("name")}
              >
                Логін{getSortIndicator("name")}
              </th>
              <th
                className="has-text-centered"
                style={{ cursor: "pointer" }}
                onClick={() => handleSort("fullName")}
              >
                Ім'я{getSortIndicator("fullName")}
              </th>
              <th className="has-text-centered">Місто</th>
              <th className="has-text-centered">Роль</th>
              <th className="has-text-centered">Редагувати</th>
              <th className="has-text-centered">Відв'язати</th>
              <th className="has-text-centered">Видалити</th>
            </tr>
          </thead>
          <tbody>{visibleRows.map((user) => renderHierarchyNode(user))}</tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={style.wrapperUserList}>
      <div className="buttons is-centered mt-3 mb-2">
        <button
          type="button"
          className={`button ${viewMode === "list" ? "is-primary" : "is-light"}`}
          onClick={() => setViewMode("list")}
        >
          Список
        </button>
        <button
          type="button"
          className={`button ${viewMode === "hierarchy" ? "is-primary" : "is-light"}`}
          onClick={() => setViewMode("hierarchy")}
        >
          Ієрархія
        </button>
      </div>

      <div style={{ margin: 10 }}>
        <button
          className="button is-success is-dark is-fullwidth"
          onClick={() => onCreateUser && onCreateUser()}
        >
          Створити користувача
        </button>
      </div>

      <div className="field is-grouped is-grouped-centered" style={{ margin: 10 }}>
        <div className="field is-small">
          <div className="select is-small">
            <select value={searchField} onChange={(e) => setSearchField(e.target.value)}>
              <option value="all">Шукати в логіні та імені</option>
              <option value="name">Шукати в логіні</option>
              <option value="fullName">Шукати в імені</option>
            </select>
          </div>
        </div>
        <div className="field is-expanded">
          <p className="control has-icons-left is-expanded">
            <input
              className="input is-small"
              type="search"
              placeholder="Пошук користувача..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="icon is-small is-left">
              <i className="fas fa-search"></i>
            </span>
          </p>
        </div>
      </div>

      <div className={style.wraperTable}>
        <div className={style.scrollContainer}>
          {viewMode === "list" ? (
            <table className="table is-bordered is-striped is-narrow is-hoverable">
              <thead>
                <tr>
                  <th className="has-text-centered">Пароль</th>
                  <th
                    className="has-text-centered"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSort("id")}
                  >
                    ID{getSortIndicator("id")}
                  </th>
                  <th
                    className="has-text-centered"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSort("name")}
                  >
                    Логін{getSortIndicator("name")}
                  </th>
                  <th
                    className="has-text-centered"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSort("fullName")}
                  >
                    Ім'я{getSortIndicator("fullName")}
                  </th>
                  <th className="has-text-centered">Місто</th>
                  <th className="has-text-centered">Роль</th>
                  <th className="has-text-centered">Редагувати</th>
                  <th className="has-text-centered">Відв'язати</th>
                  <th className="has-text-centered">Видалити</th>
                </tr>
              </thead>
              <tbody>{renderFlatRows()}</tbody>
            </table>
          ) : (
            <>
              {renderHierarchySection(
                "Ієрархія NTO → SV → TA",
                hierarchyRoots.ntos,
                "Вузли NTO не знайдено",
              )}
              {renderHierarchySection(
                "SV без NTO",
                hierarchyRoots.orphanSupervisors,
                "Усі SV прив'язані до NTO",
              )}
              {renderHierarchySection(
                "TA без керівника",
                hierarchyRoots.orphanAgents,
                "Усі TA прив'язані до SV",
              )}
              {renderHierarchySection("Інші користувачі", hierarchyRoots.others)}
            </>
          )}
        </div>
      </div>

      {isModalOpen && userToDelete && (
        <div className="modal is-active">
          <div className="modal-background"></div>
          <div className="modal-card">
            <header className="modal-card-head">
              <div
                className="modal-card-title has-text-weight-medium"
                data-cy="modal-header"
              >
                Підтвердження видалення
              </div>
            </header>

            <div className="modal-card-body">
              <p>
                Ви впевнені, що хочете видалити користувача{" "}
                <b>{userToDelete.name}</b>
              </p>
              <div className="buttons">
                <button
                  onClick={deleteUser}
                  className="button is-danger is-dark is-fullwidth"
                >
                  Видалити користувача
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="button is-success is-dark is-fullwidth"
                >
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
