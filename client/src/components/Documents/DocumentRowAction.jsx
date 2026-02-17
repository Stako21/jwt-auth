import { useState } from "react";
import {
  signDocument,
  revisionDocument,
  rejectDocument,
} from "../../services/documents.api.js";
import { ROLE_IDS } from "../../utils/roles.js";
import { DocumentHistoryModal } from "../../modals/DocumentHistoryModal";
import styles from "./DocumentRowAction.module.scss";
import { useSnackbar } from "notistack";

export default function DocumentRowActions({
  doc,
  currentUser,
  onUpdated,
  onOpenPdf,
  loadingId,
  setLoadingId,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const isAuthor = doc.author_user_id === currentUser.id;

  const canEditStatus =
    ["NEW", "REVISION"].includes(doc.status) &&
    [ROLE_IDS.Director, ROLE_IDS.Admin, ROLE_IDS.NTO, ROLE_IDS.SV].includes(
      currentUser.role,
    );

  // Показуємо кнопку відхилення для автора тільки якщо він не має прав редагувати статус
  const canRejectAsAuthor =
    isAuthor && ["NEW", "REVISION"].includes(doc.status) && !canEditStatus;

  // console.log("DocumentRowAction render:", {
  //   docId: doc.id,
  //   docStatus: doc.status,
  //   currentUserRole: currentUser.role,
  //   canEditStatus,
  //   canRejectAsAuthor,
  // });

  async function handle(action) {
    const actionsText = {
      sign: "Підписати документ?",
      revision: "Відправити документ на доопрацювання?",
      reject: "Відхилити документ остаточно?",
    };

    if (!window.confirm(actionsText[action])) return;

    const comment = prompt("Коментар (не обовʼязково):") || "";

    try {
      setLoadingId(doc.id);

      if (action === "sign") await signDocument(doc.id, comment);
      if (action === "revision") await revisionDocument(doc.id, comment);
      if (action === "reject") await rejectDocument(doc.id, comment);
    } catch (e) {
      console.error(`Error during ${action}:`, e);
      alert(`Помилка під час виконання дії: ${e.message || e}`);
    } finally {
      setLoadingId(null);
    }

    onUpdated(); // перезагрузить список
  }

  return (
    <>
      <div
        className={`buttons is-mobile are-small is-right ${styles.actionButtons}`}
      >
        {canEditStatus && (
          <>
            <button
              className="button is-success"
              onClick={() => handle("sign")}
              disabled={loadingId !== null}
              title="Підписати"
            >
              <i className="fa-solid fa-check"></i>
            </button>

            <button
              className="button is-warning"
              onClick={() => handle("revision")}
              disabled={loadingId !== null}
              title="На доопрацювання"
            >
              <i className="fa-solid fa-pen"></i>
            </button>

            <button
              className="button is-danger"
              onClick={() => handle("reject")}
              disabled={loadingId !== null}
              title="Відхилити"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </>
        )}

        {canRejectAsAuthor && (
          <button
            className="button is-danger"
            onClick={() => handle("reject")}
            disabled={loadingId !== null}
            title="Відхилити документ"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}

        <button
          className="button is-small is-light"
          onClick={() => setHistoryModalOpen(true)}
          title="Історія"
        >
          <i className="fa-solid fa-history"></i>
        </button>

        <button
          className={`button is-small is-light ${loadingId === doc.id ? "is-loading" : ""}`}
          onClick={() => onOpenPdf && onOpenPdf(doc.id)}
          disabled={loadingId === doc.id}
          title="PDF"
        >
          {/* <i className="fas fa-file-pdf"></i> */}
          PDF
        </button>
      </div>

      {historyModalOpen && (
        <DocumentHistoryModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          documentId={doc.id}
        />
      )}
    </>
  );
}
