import React, { useContext, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import Button from "../components/Button/Button";
import style from "./style.module.scss";
import { UsersList } from "../components/UsersList/UsersList";
import axios from "axios";
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
    <div className={style.wrapper}>
      <h1>Administrator Page</h1>
      <h2>Your name {userInfo.userName}</h2>
      <h2>Your role {userInfo.role}</h2>
      <Button onClick={handleLogOut}>Log Out</Button>

      <UsersList onUserSelect={setSelectedUserId} />

      {selectedUserId && (
        <div className={style.changePassword}>
          <h3>Change Password for User ID: {selectedUserId}</h3>
          <input
            type="password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button onClick={handlePasswordChange}>Change Password</Button>
        </div>
      )}
    </div>
  );
}
