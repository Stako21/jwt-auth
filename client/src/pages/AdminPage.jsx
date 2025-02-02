import React, { useContext, useState } from "react";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import style from "./style.module.scss";
import { useSnackbar } from "notistack";
import { UsersList } from "../components/UsersList/UsersList";
import { Sidebar } from "../components/Sidebar/Sidebar"
import config from "../config";

export default function AdminPage() {
  const { userInfo, handleLogOut } = useContext(AuthContext);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const { enqueueSnackbar } = useSnackbar();


  const handlePasswordChange = async () => {
    if (!selectedUserId || !newPassword) {
      enqueueSnackbar("Поле нового пароля пусте", { variant: "error" });
      return;
    }

    try {
      await axios.put(`${config.API_URL}/auth/users/${selectedUserId}/password`, { newPassword });
      enqueueSnackbar("Пароль успішно змінено!", { variant: "success" });

      setNewPassword("");
      setSelectedUserId(null);
    } catch (error) {
      enqueueSnackbar("Помилка під час зміни пароля", { variant: "error" });
      console.error("Error updating password:", error);
    }
  };

  return (
    <div className={style.adpWrapper}>
      <div className={style.adpWrapperTitle}>
        <h1>Administrator Page</h1>
        <div className={style.adpWrapperTitleUserInfo}>
          <p>Your name: {userInfo.userName}</p>
          <p>Your role: {userInfo.role === 1 ? 'admin' : 'user'}</p>
        </div>
      </div>

      <div className={style.adpWrapperSidebar}>
        <Sidebar />
        {selectedUserId && (
          <div className={style.changePass}>
            <h3>Change Password for User ID: {selectedUserId}</h3>
            <input
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button onClick={handlePasswordChange} className={style.adpChangePassBtn} >Change Password</button>

          </div>
        )}
      </div>

      <div className={style.adpWrapperList}>
        <UsersList onUserSelect={setSelectedUserId} />
      </div>
    </div>
  );
}
