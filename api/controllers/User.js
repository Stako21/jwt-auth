import bcrypt from "bcryptjs";
import UserRepository from "../repositories/User.js";
import ErrorsUtils from "../utils/Errors.js";

class UserController {
  static async getAllUsers(req, res) {
    try {
      const users = await UserRepository.getAllUsers();

      return res.status(200).json(users);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getUsersTree(req, res) {
    try {
      const [rows] = await UserRepository.findAllWithHierarchy();
      return res.status(200).json(rows);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async getSalesAgents(req, res) {
    try {
      const salesAgents = await UserRepository.getSalesAgents();
      return res.status(200).json(salesAgents);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async deleteUser(req, res) {
    const { id } = req.params;
    try {
      const userDeleted = await UserRepository.deleteUserById(id);

      if (userDeleted) {
        return res
          .status(200)
          .json({ message: "Пользователь успешно удален." });
      } else {
        return res.status(404).json({ error: "Пользователь не найден." });
      }
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async changePassword(req, res) {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters long" });
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await UserRepository.updateUserPassword(id, hashedPassword);
      return res.status(200).json({ message: "Password updated successfully" });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async updateUser(req, res) {
    const { id } = req.params;
    const { userName, user_name, role, city } = req.body;

    try {
      await UserRepository.updateUserById(id, {
        userName,
        user_name,
        role,
        city,
      });
      return res.status(200).json({ message: "User updated successfully" });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  // 🔥 ВАЖНЫЙ МЕТОД
  static async setSupervisor(req, res) {
    const { id } = req.params;
    const { supervisorId } = req.body;

    if (Number(id) === Number(supervisorId)) {
      return res.status(400).json({ message: "User cannot supervise himself" });
    }

    try {
      if (!supervisorId) {
        await UserRepository.removeParent(id);
      } else {
        await UserRepository.setParent(id, supervisorId);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default UserController;
