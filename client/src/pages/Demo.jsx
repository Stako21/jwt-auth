import { useContext } from "react";
import style from "./style.module.scss";
import { AuthContext } from "../context/AuthContext";
import Button from "../components/Button/Button";
import { UsersList } from "../components/UsersList/UsersList";
import { Link } from 'react-router-dom';

export default function Demo() {
  const { data, userInfo, handleLogOut, handleFetchProtected } = useContext(AuthContext);

  console.log('uerInfo ::::::', userInfo);

  const userRole = userInfo?.role;

  return (
    <div className="">
      <p>{JSON.stringify(data)}</p>
      {userRole === 1 && (
        <p>Добро пожаловать "{userInfo.userName}", Ваша роль - администратор!</p>
      )}

      {userRole === 3 && (
        <p>Добро пожаловать "{userInfo.userName}", Ваша роль - пользователь!</p>
      )}
      <Button onClick={handleFetchProtected}>
        Запрос на защищенный роут
      </Button>
      <Button onClick={handleLogOut}>
        Выйти
      </Button>
      <ul>
        <li><Link to="/zp">ЗП</Link></li>
        <li><Link to="/kr">КР</Link></li>
        <li><Link to="/dp">ДП</Link></li>
      </ul>
      {/* <div className="">
        <UsersList />
      </div> */}
    </div>
  );
}
