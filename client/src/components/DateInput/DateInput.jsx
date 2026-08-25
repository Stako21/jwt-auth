import cn from "classnames";
import { forwardRef } from "react";
import style from "./DateInput.module.scss";

const DateInput = forwardRef(function DateInput(
  { className, hasError = false, compact = false, ...props },
  ref,
) {
  return (
    <input
      {...props}
      ref={ref}
      type="date"
      aria-invalid={hasError || props["aria-invalid"] || undefined}
      className={cn(style.input, className, {
        [style.compact]: compact,
        [style.error]: hasError,
      })}
    />
  );
});

export default DateInput;
