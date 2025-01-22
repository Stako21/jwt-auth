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
}

export default UserController;