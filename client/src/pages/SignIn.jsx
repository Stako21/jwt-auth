import React from "react";
import { useForm, Controller } from "react-hook-form";
import { useContext } from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { AuthContext } from "../context/AuthContext";
import { signInSchema } from "./validtionSchemas";
import Field from "../components/Field/Field";
import Button from "../components/Button/Button";
import cn from "classnames";
import style from "./style.module.scss";

const defaultValues = {
  userName: "",
  password: "",
};

export default function SignIn({setLoading}) {
  const { handleSignIn } = useContext(AuthContext);

  setLoading(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues,
    resolver: yupResolver(signInSchema),
  });

  const userName = watch("userName");
  const password = watch("password");

  const isFormValid = userName && password;

  return (
    <div className={style.mainWrapper}>
      <div className={style.container}>
        <form
          onSubmit={handleSubmit(handleSignIn)}
          className={cn(style.form, style.signin)}
        >
          <h2>Увійти</h2>

          <Field
            name="userName"
            type="text"
            register={register}
            autoComplete="off"
            placeholder="Ім'я користувача"
            inputType="user"
            error={Boolean(errors.userName)}
            helperText={errors.userName?.message}
          />

          <Field
            name="password"
            type="password"
            register={register}
            autoComplete="off"
            placeholder="Пароль"
            inputType="password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
          />

          <Button disabled={isSubmitting} type="submit">
            Увійти
          </Button>
        </form>
      </div>
    </div>
  );
}
