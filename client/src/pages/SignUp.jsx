import { useForm, Controller } from "react-hook-form";
import style from "./style.module.scss";
import { AuthContext } from "../context/AuthContext";
import { useContext } from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { signUpSchema } from "./validtionSchemas";
import Select from "../components/Select/Select";
import Field from "../components/Field/Field";
import Button from "../components/Button/Button";
import cn from "classnames"

const defaultValues = {
  userName: "",
  password: "",
  role: 1,
};

const rolesList = [
  {
    id: 1,
    title: "Администратор",
  },
  {
    id: 2,
    title: "Модератор",
  },
  {
    id: 3,
    title: "Пользователь",
  },
];

export default function SignUp() {
  const { handleSignUp } = useContext(AuthContext);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues,
    resolver: yupResolver(signUpSchema),
  });

  return (
    <div className={cn("container", style.wrapper)}>
        <div className="box">
          <form className={style.wrapper} onSubmit={handleSubmit(handleSignUp)}>
            <h2 className="title is-5 has-text-centered">Создать аккаунт</h2>
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
            <Controller
              control={control}
              name="role"
              render={({ field: { onChange, value } }) => (
                <Select onChange={onChange} value={value} options={rolesList} />
              )}
            />
            <Button disabled={isSubmitting} type="submit">
              Зарегистрироваться
            </Button>
          </form>
        </div>
      </div>
  );
}
