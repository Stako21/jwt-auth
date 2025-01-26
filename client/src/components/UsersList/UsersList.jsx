import React, { useEffect, useState } from 'react';
import axios from 'axios';
import style from './UsersList.module.scss';
import config from '../../config';

export const UsersList = ({ onUserSelect }) => {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${config.API_URL}/auth/users`);
        setUsers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, []);

  const deleteUser = async (userId) => {
    try {
      await axios.delete(`${config.API_URL}/auth/users/${userId}`);
      setUsers(users.filter((user) => user.id !== userId));
      console.log(`User with ID ${userId} deleted successfully.`);
    } catch (error) {
      console.error(`Error deleting user with ID ${userId}:`, error);
    }
  };

  const handleSelectUser = (userId) => {
    setSelectedUserId(userId);
    onUserSelect(userId); // Передача выбранного пользователя в родительский компонент
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
            <tbody>
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
                      onClick={() => deleteUser(user.id)}
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
    </div>
  );
};
