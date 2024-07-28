import { useContext } from "react";
import style from "./style.module.scss";
import { AuthContext } from "../context/AuthContext";
import Button from "../components/Button/Button";
import UsersList from "../components/UsersList/UsersList";

export default function Demo() {
  const { data, handleLogOut, handleFetchProtected } = useContext(AuthContext);

  return (
    <div className={style.wrapper}>
    {/* <div className={style.wrapper}> */}
      <p>{JSON.stringify(data)}</p>
      <Button onClick={handleFetchProtected}>
        Запрос на защищенный роут
      </Button>
      <Button onClick={handleLogOut}>
        Выйти
      </Button>
      <div>
        <UsersList />
      </div>
    </div>
  );
}
