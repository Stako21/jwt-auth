import React, { useEffect, useState } from 'react';
import axios from 'axios';
import style from './UsersList.scss';
import config from '../../config';

const UsersList = () => {
  const [users, setUsers] = useState([]);

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
      await axios.delete(`${config.API_URL}/auth/users/${userId}`); // Удаление пользователя
      setUsers(users.filter((user) => user.id !== userId)); // Обновление состояния
      console.log(`User with ID ${userId} deleted successfully.`);
    } catch (error) {
      console.error(`Error deleting user with ID ${userId}:`, error);
    }
  };

  return (
    <>
      <h2>Users List</h2>
      <div className="containertable">
        <table className="table is-bordered is-striped is-narrow is-hoverable is-fullwidth">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>City</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.name}</td>
                <td>{user.city}</td>
                <td>{user.role}</td>
                <td>
                  <button
                    className="button is-danger is-small"
                    onClick={() => deleteUser(user.id)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default UsersList;
