import cn from "classnames";
import { forwardRef } from "react";
import DateInput from "../DateInput/DateInput.jsx";
import style from "./FormControl.module.scss";

const CHOICE_TYPES = new Set(["checkbox", "radio"]);

const FormInput = forwardRef(function FormInput(
  {
    className,
    hasError = false,
    compact = false,
    variant = "default",
    type = "text",
    ...props
  },
  ref,
) {
  const isChoice = CHOICE_TYPES.has(type);
  const isFile = type === "file";
  const isHidden = type === "hidden";
  const isBare = variant === "bare";
  const hasInvalidClass =
    typeof className === "string" && className.split(/\s+/).includes("is-danger");
  const isInvalid = hasError || hasInvalidClass || props["aria-invalid"] === true;

  if (type === "date" && !isBare) {
    return (
      <DateInput
        {...props}
        ref={ref}
        className={className}
        compact={compact}
        hasError={isInvalid}
        aria-invalid={isInvalid || undefined}
      />
    );
  }

  return (
    <input
      {...props}
      ref={ref}
      type={type}
      aria-invalid={isInvalid || undefined}
      className={cn(
        {
          [style.control]: !isBare && !isChoice && !isFile && !isHidden,
          [style.input]: !isBare && !isChoice && !isFile && !isHidden,
          [style.choice]: isChoice,
          [style.file]: isFile,
          [style.compact]:
            compact && !isBare && !isChoice && !isFile && !isHidden,
          [style.error]:
            isInvalid && !isBare && !isChoice && !isFile && !isHidden,
        },
        className,
      )}
    />
  );
});

export default FormInput;
