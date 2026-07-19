import validateRequest from "../utils/ValidateRequest.js";
import * as Yup from "yup";

const positiveInteger = Yup.number()
  .typeError("Value must be a number")
  .integer("Value must be an integer")
  .min(1, "Minimum value is 1");

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

export const signInSchema = Yup.object({
  body: Yup.object({
    userName: Yup.string()
      .required("Required field")
      .max(25, "Maximum length is 25 characters"),
    password: Yup.string()
      .required("Required field")
      .min(3, "Password is too short")
      .max(50, "Maximum length is 50 characters"),
  }),
});

export const signUpSchema = Yup.object({
  body: Yup.object({
    userName: Yup.string()
      .required("Required field")
      .max(25, "Maximum length is 25 characters"),
    user_name: Yup.string().nullable().max(50, "Maximum length is 50 characters"),
    userGuid: optionalGuid,
    password: Yup.string()
      .required("Required field")
      .min(3, "Password is too short")
      .max(50, "Maximum length is 50 characters"),
    role: positiveInteger.max(8, "Maximum value is 8").required("Required field"),
    city: positiveInteger.required("Required field"),
    supervisorId: positiveInteger
      .transform((value, originalValue) =>
        originalValue === "" || originalValue === null ? null : value,
      )
      .nullable(),
    branchAccessIds: Yup.array().of(positiveInteger),
    cityAccessIds: Yup.array().of(positiveInteger),
  }),
});

export const logoutSchema = Yup.object({
  cookies: Yup.object({
    refreshToken: Yup.string().required("Required field"),
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
