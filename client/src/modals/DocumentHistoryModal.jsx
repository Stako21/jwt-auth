import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { getDocumentHistory } from "../services/documents.api.js";
import styles from "./DocumentHistoryModal.module.scss";

const ACTION_LABELS = {
  CREATE: "Створено",
  STATUS_CHANGE: "Зміна статусу",
  SIGN: "Підписано",
  REVISION: "На доопрацювання",
  REJECT: "Відхилено",
};

export function DocumentHistoryModal({ isOpen, onClose, documentId }) {
  const { enqueueSnackbar } = useSnackbar();
  const [history, setHistory] = useState([]);
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
    } catch (error) {
      console.error("Error loading history:", error);
      enqueueSnackbar("Помилка завантаження історії", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

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
                        <span className="tag is-info">
                          {ACTION_LABELS[item.action] || item.action}
                        </span>
                      </td>
                      <td>
                        {item.old_status ? (
                          <span className="tag is-warning is-light">
                            {item.old_status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {item.new_status ? (
                          <span className="tag is-success is-light">
                            {item.new_status}
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

        <footer className="modal-card-foot">
          <button className="button" onClick={onClose}>
            Закрити
          </button>
        </footer>
      </div>
    </div>
  );
}
