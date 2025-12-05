import React, { useEffect, useState } from "react";
import axios from "axios";
import style from "./UsersList.module.scss";
import config from "../../config";
import { use } from "react";

export const UsersList = ({ onUserSelect, onEditUser, reloadKey = 0 }) => {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

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
  }, [reloadKey]);

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

  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
    onUserSelect(userId);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const filteredUsers = sortedUsers.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );



  const roleLabel = {
    1: "Admin",
    2: "Moderator",
    3: "User",
  };

  const cityLabel = {
    1: "ZP",
    2: "DP",
    3: "KR",
  };

  return (
    <div className={style.wrapperUserList}>
      {/* <h2>Users List</h2> */}
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
                <th className="has-text-centered">City</th>
                <th className="has-text-centered">Role</th>
                <th className="has-text-centered">Edit</th>
                <th className="has-text-centered">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
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
                  <td>{cityLabel[user.city]}</td>
                  <td>{roleLabel[user.role]}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно подтверждения */}
      {isModalOpen && userToDelete && (
        <div className="modal is-active">
          <div class="modal-background"></div>
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
