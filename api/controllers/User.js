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
}

export default UserController;