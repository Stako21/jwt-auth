import React, { useContext, useState } from "react";
import FormInput from "../components/FormControl/FormInput.jsx";
import PublicThemeToggle from "../components/PublicThemeToggle/PublicThemeToggle.jsx";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { AuthContext } from "../context/AuthContext";
import { signInSchema } from "./validtionSchemas";
import logo from "../img/ST_Wight.png";
import style from "./style.module.scss";

const defaultValues = {
  userName: "",
  password: "",
};

export default function SignIn() {
  const { handleSignIn } = useContext(AuthContext);
  const [authError, setAuthError] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues,
    resolver: yupResolver(signInSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const userNameField = register("userName");
  const passwordField = register("password");
  const hasValidationError =
    showValidationErrors && Boolean(errors.userName || errors.password);
  const hasError = authError || hasValidationError;
  const errorMessage = authError
    ? "Невірний логін або пароль"
    : hasValidationError
      ? errors.userName?.message || errors.password?.message
      : "";

  const handleFieldChange = (field) => (event) => {
    field.onChange(event);
    setAuthError(false);
    setShowValidationErrors(false);
  };

  const submit = async (values) => {
    setAuthError(false);
    setShowValidationErrors(false);
    try {
      await handleSignIn(values);
    } catch (error) {
      if (error?.response?.status === 401) {
        setAuthError(true);
      }
    }
  };

  const handleInvalid = () => {
    setAuthError(false);
    setShowValidationErrors(true);
  };

  return (
    <div className={style.mainWrapper}>
      <PublicThemeToggle className={style.loginThemeToggle} />
      <div className={style.brandMark} aria-hidden="true">
        <img src={logo} alt="" />
      </div>
      <div className={style.loginCard}>
        <div className={style.loginHeader}>
          <h1>Вхід</h1>
        </div>

        <form onSubmit={handleSubmit(submit, handleInvalid)} className={style.loginForm}>
          {hasError ? (
            <div className={style.errorBanner} role="alert">
              {errorMessage}
            </div>
          ) : null}

          <label className={style.loginField}>
            <span>Ім'я користувача</span>
            <span className={style.loginInputShell}>
              <svg className={style.fieldIcon} viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="3.25" />
                <path d="M5.5 19c.7-3.1 3.1-5 6.5-5s5.8 1.9 6.5 5" />
              </svg>
              <FormInput
                variant="bare"
                {...userNameField}
                type="text"
                autoComplete="username"
                aria-invalid={Boolean(
                  authError || (showValidationErrors && errors.userName),
                )}
                onChange={handleFieldChange(userNameField)}
              />
            </span>
          </label>

          <label className={style.loginField}>
            <span>Пароль</span>
            <span className={style.loginInputShell}>
              <svg className={style.fieldIcon} viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5.5" y="10" width="13" height="10" rx="2" />
                <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
              </svg>
              <FormInput
                variant="bare"
                {...passwordField}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={Boolean(
                  authError || (showValidationErrors && errors.password),
                )}
                onChange={handleFieldChange(passwordField)}
              />
              <button
                className={style.passwordToggle}
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Приховати пароль" : "Показати пароль"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5Z" />
                  <circle cx="12" cy="12" r="2.5" />
                  {showPassword ? <path d="m4 4 16 16" /> : null}
                </svg>
              </button>
            </span>
          </label>

          <button className={style.loginButton} disabled={isSubmitting} type="submit">
            {isSubmitting ? "Завантаження..." : "Увійти"}
          </button>
        </form>
      </div>
    </div>
  );
}
