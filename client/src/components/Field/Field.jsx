import { memo, useState } from "react";
import cn from "classnames";
import style from "./field.module.scss";

const Field = ({ register, name, error = false, helperText = "", ...rest }) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleMouseDown = () => {
    setIsPasswordVisible(true); // Меняем тип на "text"
  };

  const handleMouseUp = () => {
    setIsPasswordVisible(false); // Возвращаем тип на "password"
  };

  return (


    <div className={style.inputBox}>
      <input
        className={cn(style.input, { [style.error]: error })}
        {...register(name)}
        {...rest}
        type={isPasswordVisible && rest.inputtype === "password" ? "text" : rest.type || "text"} // Меняем тип динамически
        placeholder=""
      />
      <i
        className={cn(
          style.leftIcon,
          rest.inputtype === "user" ? "fa-regular fa-user" : "fa-solid fa-lock"
        )}
      ></i>
      <span>{rest.placeholder}</span>
      {rest.inputtype === "password" && (
        <i
          className={cn(
            style.rightIcon,
            isPasswordVisible ? "fa-regular fa-eye" : "fa-regular fa-eye-slash"
          )}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp} // На случай, если курсор уходит с иконки
        ></i>
      )}
      {error && <p className={style.helperText}>{helperText}</p>}
    </div>

  );
};

export default memo(Field);
