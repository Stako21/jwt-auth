import { memo } from "react";
import cn from "classnames";
import style from "./field.module.scss";

export default memo(
  ({ register, name, error = false, helperText = "", ...rest }) => {
    return (
      // <div className={cn(style.inputField, error && style.inputField__error)}>
      <div className={cn('field', error && 'is-danger')}>
        <input className={cn('input', error && 'is-danger')} {...register(name)} {...rest} />
        {error && <p className={'help is-danger'}>{helperText}</p>}
      </div>
    );
  }
);
