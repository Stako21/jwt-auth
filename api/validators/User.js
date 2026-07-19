import * as Yup from "yup";
import validateRequest from "../utils/ValidateRequest.js";

const positiveInteger = Yup.number()
  .typeError("Value must be a number")
  .integer("Value must be an integer")
  .min(1, "Minimum value is 1");

const optionalNullablePositiveInteger = positiveInteger
  .transform((value, originalValue) =>
    originalValue === "" || originalValue === null ? null : value,
  )
  .nullable();

const optionalGuid = Yup.string()
  .transform((value, originalValue) =>
    originalValue === "" || originalValue === null
      ? null
      : String(value).trim().toLowerCase(),
  )
  .matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "UserGUID має некоректний формат",
  )
  .nullable()
  .notRequired();

const userIdParams = Yup.object({
  id: positiveInteger.required("Required field"),
});

const updateUserSchema = Yup.object({
  params: userIdParams,
  body: Yup.object({
    userName: Yup.string().nullable().max(25, "Maximum length is 25 characters"),
    user_name: Yup.string().nullable().max(50, "Maximum length is 50 characters"),
    userGuid: optionalGuid,
    role: positiveInteger.max(8, "Maximum value is 8").required("Required field"),
    city: positiveInteger.required("Required field"),
  }),
});

const changePasswordSchema = Yup.object({
  params: userIdParams,
  body: Yup.object({
    newPassword: Yup.string()
      .required("Required field")
      .min(6, "Password is too short")
      .max(50, "Maximum length is 50 characters"),
  }),
});

const setSupervisorSchema = Yup.object({
  params: userIdParams,
  body: Yup.object({
    supervisorId: optionalNullablePositiveInteger,
  }),
});

class UserValidator {
  static async updateUser(req, res, next) {
    return validateRequest(req, res, next, updateUserSchema);
  }

  static async changePassword(req, res, next) {
    return validateRequest(req, res, next, changePasswordSchema);
  }

  static async setSupervisor(req, res, next) {
    return validateRequest(req, res, next, setSupervisorSchema);
  }
}

export default UserValidator;
