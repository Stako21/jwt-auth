import React, { useEffect, useState } from "react";
import axios from "axios";
import style from "./UsersList.module.scss";
import config from "../../config";
import { ROLE_LABELS } from "../../utils/roles";
import { ROLE_IDS } from "../../utils/roles";

export const UsersList = ({
  onUserSelect,
  onEditUser,
  reloadKey = 0,
  onCreateUser,
}) => {
  const [users, setUsers] = useState([]);
  // const [salesAgents, setSalesAgents] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${config.API_URL}/auth/users/tree/`);
        setUsers(response.data);
          
        
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, [reloadKey]);

  ////////////////////////////////////////////////////////////

  // useEffect(() => {
  //   const controller = new AbortController();
  //   const fetchSalesAgents = async () => {
  //     try {
  //       const response = await axios.get(
  //         `${config.API_URL}/auth/sales_agents`,
  //         {
  //           signal: controller.signal,
  //         }
  //       );
  //       setSalesAgents(response.data || []);
  //     } catch (error) {
  //       if (error.name === "CanceledError" || error.message === "canceled")
  //         return;
  //       console.error("Error fetching sales agents:", error);
  //     }
  //   };
  //   fetchSalesAgents();
  //   return () => controller.abort();
  // }, [reloadKey]);

  // Memoize lookup map for O(1) search by login (user.name corresponds to sales_agent.login)
  // const salesAgentByName = React.useMemo(() => {
  //   const m = new Map();
  //   for (const sa of salesAgents || []) {
  //     const key = sa?.login?.trim?.().toLowerCase?.();
  //     if (key) m.set(key, sa);
  //   }
  //   return m;
  // }, [salesAgents]);

  const childrenByParent = React.useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      if (u.parent_user_id) {
        if (!map.has(u.parent_user_id)) map.set(u.parent_user_id, []);
        map.get(u.parent_user_id).push(u);
      }
    });
    return map;
  }, [users]);

  ///////////////////////////////////////////////////////////

  const confirmDelete = (user) => {
    setUserToDelete(user); // Сохраняем объект пользователя
    setIsModalOpen(true);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      await axios.delete(`${config.API_URL}/auth/users/${userToDelete.id}`);
      setUsers(users.filter((user) => user.id !== userToDelete.id));
    } catch (error) {
      console.error(`Error deleting user ${userToDelete.name}:`, error);
    } finally {
      setIsModalOpen(false);
      setUserToDelete(null);
    }
  };

  // const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  const displayName = (u) => u.user_name || u.name;

  const sortedUsers = [...users].sort((a, b) =>
    displayName(a).localeCompare(displayName(b))
  );

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
    onUserSelect(userId);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // const filteredUsers = sortedUsers.filter((user) =>
  //   user.name.toLowerCase().includes(searchQuery.toLowerCase())
  // );
  const filteredUsers = sortedUsers.filter((user) =>
    displayName(user).toLowerCase().includes(searchQuery.toLowerCase())
  );

  filteredUsers.map((user) => {
    console.log(user.id, user.is_active);
    
  });
  

  const cityLabel = {
    1: "ZP",
    2: "DP",
    3: "KR",
  };

  const getRowStyle = (user) => {
    // TA с назначенным SV
    if (user.role === ROLE_IDS.TA && user.parent_user_id) {
      return { backgroundColor: "#0f3d2e99" }; // тёмно-зелёный
    }

    // SV с назначенным NTO
    if (user.role === ROLE_IDS.SV && user.parent_user_id) {
      return { backgroundColor: "#4a3f0b99" }; // тёмно-жёлтый
    }

    return {};
  };

  return (
    <div className={style.wrapperUserList}>
      {/* <h2>Users List</h2> */}
      <div style={{ margin: 10 }}>
        <button
          className="button is-success is-dark is-fullwidth"
          onClick={() => onCreateUser && onCreateUser()}
        >
          Create NEW User
        </button>
      </div>
      <div className="field" style={{ margin: 10 }}>
        <p className="control has-icons-left">
          <input
            className="input is-small"
            type="search"
            placeholder="Search user name..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
          <span className="icon is-small is-left">
            <i className="fas fa-search"></i>
          </span>
        </p>
      </div>
      <div className={style.wraperTable}>
        <div className={style.scrollContainer}>
          <table className="table is-bordered is-striped is-narrow is-hoverable">
            <thead>
              <tr>
                <th className="has-text-centered">Ch PWD</th>
                <th className="has-text-centered">ID</th>
                <th className="has-text-centered">Name</th>
                <th className="has-text-centered">Full Name</th>
                <th className="has-text-centered">City</th>
                <th className="has-text-centered">Role</th>
                <th className="has-text-centered">Edit</th>
                <th className="has-text-centered">Delete</th>
                <th className="has-text-centered">Info</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <React.Fragment key={user.id}>
                  <tr style={getRowStyle(user)}>
                    <td>
                      <button
                        className="button is-warning is-dark is-small"
                        type="button"
                        name="selectedUser"
                        checked={selectedUserId === user.id}
                        onClick={() => handleSelectUser(user.id)}
                      >
                        <i className="fa-solid fa-wrench"></i>
                      </button>
                    </td>
                    <td>{user.id}</td>
                    <td>{user.name}</td>
                    <td>{user.user_name}</td>
                    <td>{cityLabel[user.city]}</td>
                    <td>{ROLE_LABELS[user.role] || user.role}</td>
                    <td>
                      <button
                        type="button"
                        className="button is-info is-dark is-small"
                        onClick={() => onEditUser && onEditUser(user)}
                        title="Змінити"
                        aria-label={`edit-${user.id}`}
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
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
                    <td>
                      <button
                        type="button"
                        className="button is-link is-dark is-small"
                        onClick={() => {}}
                        title="Інформація / Команда"
                        aria-label={`info-${user.id}`}
                      >
                        <i className="fa-solid fa-info"></i>
                      </button>
                    </td>
                  </tr>
                  {(ROLE_LABELS[user.role] === "SV" ||
                    ROLE_LABELS[user.role] === "NTO") && (
                    <tr style={{ backgroundColor: "#262b33" }}>
                      <td colSpan="9">
                        {childrenByParent.get(user.id)?.length ? (
                          childrenByParent
                            .get(user.id)
                            .map((c) => <div key={c.id}>• {c.user_name}</div>)
                        ) : (
                          <div style={{ opacity: 0.6 }}>Немає підлеглих</div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно подтверждения */}
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
                  Delete User
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="button is-success is-dark is-fullwidth"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
