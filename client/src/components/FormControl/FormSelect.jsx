import cn from "classnames";
import { forwardRef } from "react";
import style from "./FormControl.module.scss";

const FormSelect = forwardRef(function FormSelect(
  {
    className,
    hasError = false,
    compact = false,
    variant = "default",
    children,
    ...props
  },
  ref,
) {
  const isBare = variant === "bare";
  const hasInvalidClass =
    typeof className === "string" && className.split(/\s+/).includes("is-danger");
  const isInvalid = hasError || hasInvalidClass || props["aria-invalid"] === true;

  return (
    <select
      {...props}
      ref={ref}
      data-ui-control="select"
      aria-invalid={isInvalid || undefined}
      className={cn(className, {
        [style.control]: !isBare,
        [style.select]: !isBare,
        [style.compact]: compact && !isBare,
        [style.error]: isInvalid && !isBare,
      })}
    >
      {children}
    </select>
  );
});

export default FormSelect;
