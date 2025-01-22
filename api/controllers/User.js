import bcrypt from 'bcryptjs';
import UserRepository from '../repositories/User.js';
import ErrorsUtils from '../utils/Errors.js';

class UserController {
  static async getAllUsers(req, res) {
    try {
      const users = await UserRepository.getAllUsers();
      return res.status(200).json(users);
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async deleteUser(req, res) {
    const { id } = req.params;
    try {
      const userDeleted = await UserRepository.deleteUserById(id);

      if (userDeleted) {
        return res.status(200).json({ message: 'Пользователь успешно удален.' });
      } else {
        return res.status(404).json({ error: 'Пользователь не найден.' });
      }
    } catch (err) {
      console.error('Ошибка удаления пользователя:', err);
      return ErrorsUtils.catchError(res, err);
    }
  }

  static async changePassword(req, res) {
    const { id } = req.params;
    const { newPassword } = req.body;
  
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }
  
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10); // Хэшируем новый пароль
      await UserRepository.updateUserPassword(id, hashedPassword); // Обновляем пароль в базе данных
      return res.status(200).json({ message: "Password updated successfully" });
    } catch (err) {
      return ErrorsUtils.catchError(res, err);
    }
  }
}

export default UserController;