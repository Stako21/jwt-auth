import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSnackbar } from "notistack";
import {
  getDocumentHistory,
  getDocumentNotificationHistory,
} from "../services/documents.api.js";
import styles from "./DocumentHistoryModal.module.scss";

const ACTION_LABELS = {
  CREATE: { label: "Створено", tone: "info" },
  STATUS_CHANGE: { label: "Зміна статусу", tone: "info" },
  PREPARE: { label: "Погоджено до підпису", tone: "info" },
  SIGN: { label: "Підписано", tone: "positive" },
  REVISION: { label: "На доопрацювання", tone: "warning" },
  REJECT: { label: "Відхилено", tone: "negative" },
};

const STATUS_LABELS = {
  NEW: { label: "Новий", tone: "neutral" },
  PREPARED: { label: "Погоджено", tone: "info" },
  REVISION: { label: "На доопрацювання", tone: "warning" },
  REJECTED: { label: "Відхилено", tone: "negative" },
  SIGNED: { label: "Підписано", tone: "positive" },
};

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("uk-UA");
}

function ToneText({ config, fallback }) {
  const label = config?.label || fallback || "—";
  return <span className={styles[config?.tone || "neutral"]}>{label}</span>;
}

export function DocumentHistoryModal({ isOpen, onClose, documentId }) {
  const { enqueueSnackbar } = useSnackbar();
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !documentId) return undefined;
    let isActive = true;
    setLoading(true);
    Promise.all([
      getDocumentHistory(documentId),
      getDocumentNotificationHistory(documentId),
    ])
      .then(([nextHistory, nextNotifications]) => {
        if (!isActive) return;
        setHistory(Array.isArray(nextHistory) ? nextHistory : []);
        setNotifications(Array.isArray(nextNotifications) ? nextNotifications : []);
      })
      .catch((error) => {
        if (!isActive) return;
        console.error("Error loading history:", error);
        enqueueSnackbar("Помилка завантаження історії", { variant: "error" });
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [documentId, enqueueSnackbar, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="document-history-title">
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрити історію документа" />
      <div className={styles.card}>
        <header className={styles.header}>
          <h2 id="document-history-title">Історія документа</h2>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="Закрити">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          {loading ? <p className={styles.state}>Завантаження…</p> : null}
          {!loading ? (
            <section className={styles.section}>
              <h3>Зміни документа</h3>
              {history.length ? (
                <div className={styles.tableShell}>
                  <table className={styles.table}>
                    <thead><tr><th>Дата</th><th>Користувач</th><th>Дія</th><th>Старий статус</th><th>Новий статус</th><th>Коментар</th></tr></thead>
                    <tbody>
                      {history.map((item, index) => (
                        <tr key={item.id || `${item.created_at}-${index}`}>
                          <td>{formatDateTime(item.created_at)}</td>
                          <td>{item.user_name || "—"}</td>
                          <td><ToneText config={ACTION_LABELS[item.action]} fallback={item.action} /></td>
                          <td><ToneText config={STATUS_LABELS[item.old_status]} fallback={item.old_status} /></td>
                          <td><ToneText config={STATUS_LABELS[item.new_status]} fallback={item.new_status} /></td>
                          <td className={styles.comment}>{item.comment || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className={styles.empty}>Історію не знайдено</p>}
            </section>
          ) : null}

          {!loading ? (
            <section className={styles.section}>
              <h3>Історія сповіщень</h3>
              {notifications.length ? (
                <div className={styles.tableShell}>
                  <table className={styles.table}>
                    <thead><tr><th>Канал</th><th>Адресат</th><th>Статус</th><th>Помилка</th><th>Дата</th></tr></thead>
                    <tbody>
                      {notifications.map((item, index) => {
                        const tone = item.status === "SUCCESS" ? "positive" : item.status === "ERROR" ? "negative" : "neutral";
                        return (
                          <tr key={item.id || `${item.created_at}-${index}`}>
                            <td>{item.channel || "—"}</td><td>{item.target || "—"}</td>
                            <td className={styles[tone]}>{item.status || "—"}</td>
                            <td className={item.error_text ? styles.negative : ""}>{item.error_text || "—"}</td>
                            <td>{formatDateTime(item.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className={styles.empty}>Сповіщень не знайдено</p>}
            </section>
          ) : null}
        </div>

        <footer className={styles.footer}><button type="button" onClick={onClose}>Закрити</button></footer>
      </div>
    </div>,
    document.body,
  );
}
