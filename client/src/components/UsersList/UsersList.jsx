import React, { useEffect, useState } from "react";
import axios from "axios";
import style from "./UsersList.module.scss";
import config from "../../config";

export const UsersList = ({ onUserSelect }) => {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

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
  }, []);

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

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
    onUserSelect(userId);
  };

  return (
    <div className={style.wrapperUserList}>
      <h2>Users List</h2>
      <div className={style.wraperTable}>
        <div className={style.scrollContainer}>
          <table className={style.table}>
            <thead className={style.tableHeader}>
              <tr>
                <th className={style.Select}>Select</th>
                <th className={style.ID}>ID</th>
                <th className={style.Name}>Name</th>
                <th className={style.City}>City</th>
                <th className={style.Role}>Role</th>
                <th className={style.Actions}>Actions</th>
              </tr>
            </thead>
            <tbody className={style.tableBody}>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <input
                      type="radio"
                      name="selectedUser"
                      checked={selectedUserId === user.id}
                      onChange={() => handleSelectUser(user.id)}
                    />
                  </td>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.city}</td>
                  <td>{user.role}</td>
                  <td>
                    <button
                      className={style.deleteBotton}
                      onClick={() => confirmDelete(user)}
                    >
                      Видалити
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
        <div className={style.modalOverlay}>
          <div className={style.modal}>
            <h3>Підтвердження видалення</h3>
            <p>Ви впевнені, що хочете видалити користувача <b>{userToDelete.name}</b>?</p>
            <div className={style.modalButtons}>
              <button onClick={() => setIsModalOpen(false)} className={style.cancelButton}>Скасувати</button>
              <button onClick={deleteUser} className={style.deleteButton}>
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
