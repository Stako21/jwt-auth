import { response } from "express";
import pool from "../db.cjs";

class UserRepository {
  static async createUser({ userName, hashedPassword, role }) {
    const response = await pool.query(
      "INSERT INTO users (name, password, role) VALUES (?, ?, ?) RETURNING *",
      [userName, hashedPassword, role]
    );

    return response.rows[0];
  }

  // static async getUserData(userName) {
  //   const response = await pool.query("SELECT * FROM users WHERE name=$1", [
  //     userName,
  //   ]);

  //   if (!response.rows.length) {
  //     return null;
  //   }

  //   return response.rows[0];
  // };
  static async getUserData(userName) {
    console.log(userName);
    // const response = await pool.query("SELECT * FROM users WHERE name = ?", [userName]);
    try {
      const response = await pool.query("SELECT * FROM users WHERE name = ?", [userName]);
      console.log("response_log", response);
      // Додатковий код обробки відповіді від бази даних
    } catch (error) {
      console.error("Помилка запиту до бази даних:", error);
    }

    // console.log("response_log", response);

    console.log(!response);
    console.log(!response.rows);
    // console.log("AAAAAAAAAAAAAAAAA!", response.RowDataPacket[0]);

    // if (!response.rows) {
    //   return;
    // }
    // if (!response || !response.rows || !response.rows.length) {
    //   return null;
    // }
    // pool.query("SELECT * FROM users", (error, results, fields) => {
    pool.query(("SELECT * FROM users WHERE name = ?", [userName]), (error, results, fields) => {
      if (error) {
        console.error("Помилка запиту:", error);
        return;
      }
    
      console.log("Результати запиту:", results); // Результати у вигляді масиву об'єктів
    });
    
    // return response.rows[0];

  }
}

export default UserRepository;
