import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import Button from "../components/Button/Button";
import style from "./style.module.scss";

export default function AdminPage() {
  const { userInfo, handleLogOut } = useContext(AuthContext);

  return (
    <div className={style.wrapper}>
      <h1>It is addministrator page</h1>
      <h2>Your name {userInfo.userName}</h2>
      <h2>Your role {userInfo.role}</h2>
      <Button onClick={handleLogOut}>
        Выйти
      </Button>
    </div>
  );
}