import { useState } from "react";
import {
  signDocument,
  prepareDocument,
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
  const isTopRole = [
    ROLE_IDS.Director,
    ROLE_IDS.Admin,
    ROLE_IDS.NTO,
  ].includes(currentUser.role);
  const isSv = currentUser.role === ROLE_IDS.SV;

  const canPrepare =
    (isSv && ["NEW", "REVISION"].includes(doc.status)) ||
    (isTopRole && ["NEW", "REVISION"].includes(doc.status));
  const canSign = isTopRole && doc.status === "PREPARED";
  const canRevision =
    (isSv && ["NEW", "REVISION"].includes(doc.status)) ||
    (isTopRole && doc.status === "PREPARED");
  const canRejectAsReviewer = canRevision;
  const canRejectAsAuthor =
    isAuthor &&
    ["NEW", "REVISION", "PREPARED"].includes(doc.status) &&
    !canRejectAsReviewer;

  async function handle(action) {
    const actionsText = {
      prepare: "Погодити документ для підпису?",
      sign: "Підписати документ?",
      revision: "Відправити документ на доопрацювання?",
      reject: "Відхилити документ остаточно?",
    };

    if (!window.confirm(actionsText[action])) return;

    const comment = prompt("Коментар (не обов'язково):") || "";

    try {
      setLoadingId(doc.id);

      if (action === "prepare") await prepareDocument(doc.id, comment);
      if (action === "sign") await signDocument(doc.id, comment);
      if (action === "revision") await revisionDocument(doc.id, comment);
      if (action === "reject") await rejectDocument(doc.id, comment);
    } catch (e) {
      console.error(`Error during ${action}:`, e);
      const message =
        e.response?.data?.message ||
        e.message ||
        "Помилка під час виконання дії";
      enqueueSnackbar(message, { variant: "error" });
    } finally {
      setLoadingId(null);
    }

    onUpdated();
  }

  return (
    <>
      <div
        className={`buttons is-mobile are-small is-right ${styles.actionButtons}`}
      >
        {(canPrepare || canSign || canRevision || canRejectAsReviewer) && (
          <>
            {canPrepare && (
              <button
                className="button is-link"
                onClick={() => handle("prepare")}
                disabled={loadingId !== null}
                title="Погодити до підпису"
              >
                <i className="fa-solid fa-clipboard-check"></i>
              </button>
            )}

            {canSign && (
              <button
                className="button is-success"
                onClick={() => handle("sign")}
                disabled={loadingId !== null}
                title="Підписати"
              >
                <i className="fa-solid fa-check"></i>
              </button>
            )}

            {canRevision && (
              <button
                className="button is-warning"
                onClick={() => handle("revision")}
                disabled={loadingId !== null}
                title="На доопрацювання"
              >
                <i className="fa-solid fa-pen"></i>
              </button>
            )}

            {canRejectAsReviewer && (
              <button
                className="button is-danger"
                onClick={() => handle("reject")}
                disabled={loadingId !== null}
                title="Відхилити"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
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
