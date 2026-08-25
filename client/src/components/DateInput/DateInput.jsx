import cn from "classnames";
import { forwardRef } from "react";
import style from "./DateInput.module.scss";

const DateInput = forwardRef(function DateInput(
  { className, hasError = false, ...props },
  ref,
) {
  return (
    <input
      {...props}
      ref={ref}
      type="date"
      className={cn(style.input, className, {
        [style.error]: hasError,
      })}
    />
  );
});

export default DateInput;
