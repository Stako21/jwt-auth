import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import FormInput from "../FormControl/FormInput.jsx";
import style from "./DocumentRegistryOptionsModal.module.scss";

export default function DocumentRegistryOptionsModal({
  action,
  columns,
  busy = false,
  onClose,
  onConfirm,
}) {
  const titleId = useId();
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());

  useEffect(() => {
    setSelectedKeys(new Set(columns.filter((column) => column.defaultSelected).map((column) => column.key)));
  }, [columns]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const selectedInOrder = useMemo(
    () => columns.filter((column) => selectedKeys.has(column.key)).map((column) => column.key),
    [columns, selectedKeys],
  );

  const toggleColumn = (key) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return createPortal(
    <div className={style.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button className={style.backdrop} type="button" onClick={onClose} disabled={busy} aria-label="Закрити" />
      <section className={style.card}>
        <header className={style.header}>
          <div>
            <h2 id={titleId}>{action === "print" ? "Друк реєстру" : "Збереження XLSX"}</h2>
            <p>Оберіть колонки, які потрібно включити</p>
          </div>
          <button className={style.closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Закрити">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className={style.body}>
          <div className={style.quickActions}>
            <button type="button" onClick={() => setSelectedKeys(new Set(columns.map((column) => column.key)))}>Обрати всі</button>
            <button type="button" onClick={() => setSelectedKeys(new Set())}>Очистити</button>
          </div>
          <div className={style.columnGrid}>
            {columns.map((column) => (
              <label key={column.key} className={style.columnChoice}>
                <FormInput
                  type="checkbox"
                  checked={selectedKeys.has(column.key)}
                  onChange={() => toggleColumn(column.key)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </div>

        <footer className={style.footer}>
          <span>Обрано: {selectedKeys.size}</span>
          <div>
            <button className={style.cancelButton} type="button" onClick={onClose} disabled={busy}>Скасувати</button>
            <button
              className={style.confirmButton}
              type="button"
              onClick={() => onConfirm(selectedInOrder)}
              disabled={busy || !selectedInOrder.length}
            >
              {busy ? "Формування…" : action === "print" ? "Друкувати" : "Зберегти XLSX"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
