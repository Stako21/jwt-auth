import { useEffect, useId } from "react";

export function ConfigurationEditorModal({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
}) {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  return (
    <div
      className={`modal is-active config-editor-modal ${
        wide ? "config-editor-modal-wide" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="modal-background"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
      />
      <div className="modal-card">
        <header className="modal-card-head">
          <p id={titleId} className="modal-card-title">
            {title}
          </p>
          <button
            type="button"
            className="delete"
            aria-label="Закрити"
            onClick={onClose}
            disabled={busy}
          />
        </header>
        <div className="modal-card-body">{children}</div>
      </div>
    </div>
  );
}
