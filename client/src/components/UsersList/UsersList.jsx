import React, { useEffect, useState } from 'react';
import axios from 'axios';
import style from './UsersList.scss'
import config from '../../config';

const UsersList = () => {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${config.API_URL}/auth/users`)
        console.log("response.data !!!!!!!!!!!!!!!! :", response.data);
        setUsers(response.data);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div>
      <h1>Users List</h1>
      <div className='listBox'>
        <ul>
          {users.map(user => (
            <li key={user.id}>
              <span>{user.name}</span>
              <span>(Role: {user.role})</span>               
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default UsersList;
