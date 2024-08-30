import { useForm } from "react-hook-form";
import style from "./style.module.scss";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { yupResolver } from "@hookform/resolvers/yup";
import { signInSchema } from "./validtionSchemas";
import Field from "../components/Field/Field";
import Button from "../components/Button/Button";
import Header from "../components/Header/Header";
import cn from "classnames";

const defaultValues = {
  userName: "",
  password: "",
};

export default function SignIn() {
  const { handleSignIn } = useContext(AuthContext);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues,
    resolver: yupResolver(signInSchema),
  });

  return (
    <>
    <div className={cn("container", style.wrapper)}>
      <div className="box">
        <form onSubmit={handleSubmit(handleSignIn)} className={style.wrapper}>
          <h2 className="title is-5 has-text-centered">Войти в аккаунт</h2>
          <Field
            name="userName"
            register={register}
            autoComplete="off"
            placeholder="Имя пользователя"
            error={Boolean(errors.userName)}
            helperText={errors.userName?.message}
          />
          <Field
            name="password"
            register={register}
            autoComplete="off"
            placeholder="Пароль"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
          />
          <Button disabled={isSubmitting} type="submit">
            Войти
          </Button>
        </form>
      </div>
    </div>
    </>
  );
}
