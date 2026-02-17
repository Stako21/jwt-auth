import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import {
  getDocumentHistory,
  getDocumentNotificationHistory,
} from "../services/documents.api.js";
import styles from "./DocumentHistoryModal.module.scss";
import cn from "classnames";

const ACTION_LABELS = {
  CREATE: {
    label: "Створено",
    className: "has-text-primary",
  },
  STATUS_CHANGE: {
    label: "Зміна статусу",
    className: "has-text-info",
  },
  SIGN: {
    label: "Підписано",
    className: "has-text-success",
  },
  REVISION: {
    label: "На доопрацювання",
    className: "has-text-warning",
  },
  REJECT: {
    label: "Відхилено",
    className: "has-text-danger",
  },
};

const STATUS_LABELS = {
  NEW: {
    label: "Новий",
    className: "has-text-info",
  },
  REVISION: {
    label: "На доопрацювання",
    className: "has-text-warning",
  },
  REJECTED: {
    label: "Відхилено",
    className: "has-text-danger",
  },
  SIGNED: {
    label: "Підписано",
    className: "has-text-success",
  },
}

export function DocumentHistoryModal({ isOpen, onClose, documentId }) {
  const { enqueueSnackbar } = useSnackbar();
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && documentId) {
      loadHistory();
    }
  }, [isOpen, documentId]);

  async function loadHistory() {
    try {
      setLoading(true);
      const data = await getDocumentHistory(documentId);
      setHistory(data);

      const dataHistory = await getDocumentNotificationHistory(documentId);
      setNotifications(dataHistory);
    } catch (error) {
      console.error("Error loading history:", error);
      enqueueSnackbar("Помилка завантаження історії", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  console.log("History: ", history);
  

  if (!isOpen) return null;

  return (
    <div className="modal is-active">
      <div className="modal-background" onClick={onClose} />

      <div className="modal-card" style={{ width: "90%", maxWidth: "900px" }}>
        <header className="modal-card-head has-text-left">
          <p className="modal-card-title">Історія документа</p>
          <button className="delete" onClick={onClose} />
        </header>

        <section className="modal-card-body">
          {loading && <div className="has-text-centered">Завантаження...</div>}

          {!loading && history.length === 0 && (
            <p className="has-text-grey">Історія не знайдена</p>
          )}

          {!loading && history.length > 0 && (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-narrow is-size-7 has-text-left">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Користувач</th>
                    <th>Дія</th>
                    <th>Старий статус</th>
                    <th>Новий статус</th>
                    <th>Коментар</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        {new Date(item.created_at).toLocaleString("uk-UA")}
                      </td>
                      <td>{item.user_name || "—"}</td>
                      <td>
                        <span className={ACTION_LABELS[item.action]?.className || ""}>
                          {ACTION_LABELS[item.action]?.label || item.action}
                        </span>
                      </td>
                      <td>
                        {item.old_status ? (
                          <span className={STATUS_LABELS[item.old_status]?.className || ""}>
                            {STATUS_LABELS[item.old_status]?.label || item.old_status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item.new_status ? (
                          <span className={STATUS_LABELS[item.new_status]?.className || ""}>
                            {STATUS_LABELS[item.new_status]?.label || item.new_status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={styles.comment}>{item.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="modal-card-body">
          <h3 className="is-size-6 has-text-weight-bold">Історія сповіщень</h3>
          {notifications.length > 0 ? (
            <div className="table-container">
              <table className="table is-fullwidth is-striped is-narrow is-size-7 has-text-left">
                <thead>
                  <tr>
                    <th>Канал</th>
                    <th>Адресат</th>
                    <th>Статус</th>
                    <th>Помилка</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.channel}</td>
                      <td>{item.target}</td>
                      <td
                        className={cn("is-capitalized", {
                          "has-text-success": item.status === "SUCCESS",
                          "has-text-danger": item.status === "ERROR",
                        })}
                      >
                        {item.status}
                      </td>
                      <td className={item.error_text ? "has-text-danger" : ""}>
                        {item.error_text || "—"}
                      </td>
                      <td>
                        {new Date(item.created_at).toLocaleString("uk-UA")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="has-text-grey">Сповіщення не знайдено</p>
          )}
        </section>

        <footer className="modal-card-foot">
          <button className="button" onClick={onClose}>
            Закрити
          </button>
        </footer>
      </div>
    </div>
  );
}
