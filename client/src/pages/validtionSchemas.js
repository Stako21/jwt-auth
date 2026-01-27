import * as Yup from "yup";

export const signInSchema = Yup.object({
  userName: Yup.string()
    .required("Обов'язкове поле!")
    .max(25, "Максимальная длина - 25 символов"),
  password: Yup.string()
    .required("Обов'язкове поле!")
    .min(3, "Пароль занадто короткий!")
    .max(50, "Максимальная длина - 50 символов"),
});

export const signUpSchema = Yup.object({
  userName: Yup.string()
    .required("Обов'язкове поле!")
    .max(25, "Максимальная длина - 25 символов"),
  user_name: Yup.string().max(25, "Максимальная длина - 25 символов"),
  password: Yup.string()
    .required("Обов'язкове поле!")
    .min(3, "Пароль занадто короткий!")
    .max(50, "Максимальная длина - 50 символов"),
  role: Yup.number()
    .required("Обов'язкове поле!")
    .typeError("Значение должно быть числом!")
    .min(1, "Минимальное значение - 1")
    .max(7, "Максимальное значение - 7"),
});
