import { useForm, Controller } from "react-hook-form";
import style from "./style.module.scss";
import { AuthContext } from "../context/AuthContext";
import { useContext } from "react";
import { yupResolver } from "@hookform/resolvers/yup";
import { signUpSchema } from "./validtionSchemas";
import Select from "../components/Select/Select";
import Field from "../components/Field/Field";
import Button from "../components/Button/Button";
import cn from "classnames";
import { ROLE_OPTIONS } from "../utils/roles";

const defaultValues = {
  userName: "",
  user_name: "",
  password: "",
  role: 1,
  city: 1,
};

const rolesList = ROLE_OPTIONS.map(({ value, label }) => ({
  id: value,
  title: label,
}));

const citiesList = [
  { id: 1, title: "Запоріжжя" },
  { id: 2, title: "Дніпро" },
  { id: 3, title: "Кривий Ріг" },
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
    <div className={style.mainWrapper}>
      <div className={style.container}>
        <form
          className={cn(style.form, style.signin)}
          onSubmit={handleSubmit(handleSignUp)}
        >
          <h2 className="">Створити аккаунт</h2>
          <Field
            name="userName"
            register={register}
            autoComplete="off"
            placeholder="Ім'я користувача (логін)"
            inputtype="user"
            error={Boolean(errors.userName)}
            helperText={errors.userName?.message}
          />
          <Field
            name="user_name"
            register={register}
            autoComplete="off"
            placeholder="Отображаемое имя (user_name) - необязательно"
            inputtype="user"
            error={Boolean(errors.user_name)}
            helperText={errors.user_name?.message}
          />
          <Field
            name="password"
            register={register}
            autoComplete="off"
            placeholder="Пароль"
            inputtype="password"
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
          <Controller
            control={control}
            name="city"
            render={({ field: { onChange, value } }) => (
              <Select onChange={onChange} value={value} options={citiesList} />
            )}
          />
          <Button disabled={isSubmitting} type="submit">
            Зарееструватись
          </Button>
        </form>
      </div>
    </div>
  );
}
