import cn from "classnames";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import style from "./CompactSelect.module.scss";

export default function CompactSelect({
  value,
  options,
  onChange,
  placeholder = "— Оберіть —",
  disabled = false,
  hasError = false,
  ariaLabel,
  className,
  placement = "bottom",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxId = useId();
  const normalizedValue = String(value ?? "");
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === normalizedValue),
    [normalizedValue, options],
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const selectOption = (nextValue) => {
    onChange(String(nextValue));
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={cn(style.root, className, {
        [style.openUp]: placement === "top",
      })}
    >
      <button
        ref={triggerRef}
        className={cn(style.trigger, {
          [style.open]: isOpen,
          [style.error]: hasError,
        })}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        aria-invalid={hasError || undefined}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsOpen(false);
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <span className={cn({ [style.placeholder]: !selectedOption })}>
          {selectedOption?.label || placeholder}
        </span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>

      {isOpen ? (
        <div
          id={listboxId}
          className={style.options}
          role="listbox"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          {options.map((option) => {
            const optionValue = String(option.value);
            const isSelected = optionValue === normalizedValue;

            return (
              <button
                key={optionValue}
                className={cn(style.option, {
                  [style.selected]: isSelected,
                })}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(optionValue)}
              >
                <span>{option.label}</span>
                {isSelected ? (
                  <i className="fa-solid fa-check" aria-hidden="true"></i>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
