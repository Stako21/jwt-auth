import React, { useContext, useState } from "react";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import Button from "../components/Button/Button";
import style from "./style.module.scss";
import { UsersList } from "../components/UsersList/UsersList";
import { Sidebar } from "../components/Sidebar/Sidebar"
import config from "../config";

export default function AdminPage() {
  const { userInfo, handleLogOut } = useContext(AuthContext);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const handlePasswordChange = async () => {
    if (!selectedUserId || !newPassword) {
      alert("Please select a user and enter a new password.");
      return;
    }

    try {
      await axios.put(`${config.API_URL}/auth/users/${selectedUserId}/password`, { newPassword });
      alert("Password updated successfully!");
      setNewPassword("");
      setSelectedUserId(null);
    } catch (error) {
      console.error("Error updating password:", error);
      alert("Failed to update password.");
    }
  };

  return (
    <div className={style.adpWrapper}>
      <div className={style.adpWrapperTitle}>
        <h1>Administrator Page</h1>
        <div className={style.adpWrapperTitleUserInfo}>
          <p>Your name {userInfo.userName}</p>
          <p>Your role {userInfo.role === 1 ? 'admin' : 'user'}</p>
        </div>
        {/* <Button onClick={handleLogOut}>Log Out</Button> */}
      </div>

      <div lassName={style.adpWrapperSidebar}>
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
            <button Click={handlePasswordChange}>Change Password</button>

          </div>
        )}
      </div>


      <div className={style.adpWrapperList}>
        <UsersList onUserSelect={setSelectedUserId} />
      </div>


    </div>
  );
}
