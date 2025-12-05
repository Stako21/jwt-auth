import validateRequest from "../utils/ValidateRequest.js";
import * as Yup from "yup";

export const signInSchema = Yup.object({
  body: Yup.object({
    userName: Yup.string()
      .required("Обов'язкове поле!")
      .max(25, "Максимальная длина - 25 символов"),
    password: Yup.string()
      .required("Обов'язкове поле!")
      .min(3, "Пароль занадто короткий!")
      .max(50, "Максимальная длина - 50 символов"),
  }),
});

export const signUpSchema = Yup.object({
  body: Yup.object({
    userName: Yup.string()
      .required("Обов'язкове поле!")
      .max(25, "Максимальная длина - 25 символов"),
    password: Yup.string()
      .required("Обов'язкове поле!")
      .min(3, "Пароль занадто короткий!")
      .max(50, "Максимальная длина - 50 символов"),
    role: Yup.number()
      .required("Обов'язкове поле!")
      .typeError("Значение должно быть числом!")
      .min(1, "Минимальное значение - 1")
      .max(3, "Максимальное значение - 3"),
  }),
});

export const logoutSchema = Yup.object({
  cookies: Yup.object({
    refreshToken: Yup.string().required("Обов'язкове поле!"),
  }),
});

class AuthValidator {
  static async signIn(req, res, next) {
    return validateRequest(req, res, next, signInSchema);
  }

  static async signUp(req, res, next) {
    return validateRequest(req, res, next, signUpSchema);
  }

  static async logOut(req, res, next) {
    return validateRequest(req, res, next, logoutSchema);
  }

  static async refresh(req, res, next) {
    return validateRequest(req, res, next);
  }
}

export default AuthValidator;
