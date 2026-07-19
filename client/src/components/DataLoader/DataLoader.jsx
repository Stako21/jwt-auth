import style from "./DataLoader.module.scss";

export function DataLoader({
  label = "Завантаження даних…",
  compact = false,
  fullPage = false,
}) {
  const className = [
    style.loader,
    compact ? style.compact : "",
    fullPage ? style.fullPage : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} role="status" aria-live="polite">
      <span className={style.spinner} aria-hidden="true">
        <span className={style.core} />
      </span>
      {label ? <span className={style.label}>{label}</span> : null}
    </div>
  );
}
