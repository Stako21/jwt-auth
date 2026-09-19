import { useState } from "react";
import { useSnackbar } from "notistack";
import {
  prepareDocument,
  rejectDocument,
  revisionDocument,
  signDocument,
} from "../../services/documents.api.js";
import { ROLE_IDS } from "../../utils/roles.js";
import { DocumentHistoryModal } from "../../modals/DocumentHistoryModal";
import styles from "./DocumentRowAction.module.scss";

function ActionButton({
  label,
  icon,
  variant = "neutral",
  disabled = false,
  loading = false,
  onClick,
}) {
  return (
    <button
      className={`${styles.actionButton} ${styles[variant]}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <i
        className={`fa-solid ${icon} ${loading ? "fa-spin" : ""}`}
        aria-hidden="true"
      ></i>
    </button>
  );
}

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

  const role = Number(currentUser.role);
  const isAuthor = Number(doc.author_user_id) === Number(currentUser.id);
  const isTopRole = [ROLE_IDS.Director, ROLE_IDS.Admin, ROLE_IDS.NTO].includes(
    role,
  );
  const isSv = role === ROLE_IDS.SV;
  const isTro = doc.document_type === "TRO";
  const isSameBranch =
    Number(doc.branch_id || currentUser.branchId) === Number(currentUser.branchId);

  const canPrepare = !isTro && (
    (isSv && ["NEW", "REVISION"].includes(doc.status)) ||
    (isTopRole && isSameBranch && ["NEW", "REVISION"].includes(doc.status))
  );
  const canSign = isTro
    ? (
      [ROLE_IDS.SV, ROLE_IDS.NTO].includes(role) ||
      ([ROLE_IDS.Admin, ROLE_IDS.Director].includes(role) && isSameBranch)
    ) && ["NEW", "REVISION"].includes(doc.status)
    : isTopRole && isSameBranch && doc.status === "PREPARED";
  const canRevision = isTro
    ? [ROLE_IDS.SV, ROLE_IDS.NTO].includes(role) && ["NEW", "REVISION"].includes(doc.status)
    :
    (isSv && ["NEW", "REVISION"].includes(doc.status)) ||
    (isTopRole && isSameBranch && doc.status === "PREPARED");
  const canRejectAsReviewer = canRevision;
  const canRejectAsAuthor =
    isAuthor &&
    ["NEW", "REVISION", "PREPARED"].includes(doc.status) &&
    !canRejectAsReviewer;
  const isWorkflowBusy = loadingId !== null;
  const actionCount =
    Number(canPrepare) +
    Number(canSign) +
    Number(canRevision) +
    Number(canRejectAsReviewer || canRejectAsAuthor) +
    1 + Number(!isTro);

  async function handle(action) {
    const actionsText = {
      prepare: "Погодити документ для підпису?",
      sign: "Підписати документ?",
      revision: "Відправити документ на доопрацювання?",
      reject: "Відхилити документ остаточно?",
    };

    if (!window.confirm(actionsText[action])) return;
    const comment = window.prompt("Коментар (не обов'язково):") || "";

    try {
      setLoadingId(doc.id);
      if (action === "prepare") await prepareDocument(doc.id, comment);
      if (action === "sign") await signDocument(doc.id, comment);
      if (action === "revision") await revisionDocument(doc.id, comment);
      if (action === "reject") await rejectDocument(doc.id, comment);
      onUpdated();
    } catch (error) {
      console.error(`Error during ${action}:`, error);
      enqueueSnackbar(
        error.response?.data?.message ||
          error.message ||
          "Помилка під час виконання дії",
        { variant: "error" },
      );
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <div className={styles.actionButtons} data-action-count={actionCount}>
        {canPrepare ? (
          <ActionButton
            label="Погодити до підпису"
            icon="fa-clipboard-check"
            variant="prepare"
            disabled={isWorkflowBusy}
            onClick={() => handle("prepare")}
          />
        ) : null}

        {canSign ? (
          <ActionButton
            label="Підписати"
            icon="fa-signature"
            variant="sign"
            disabled={isWorkflowBusy}
            onClick={() => handle("sign")}
          />
        ) : null}

        {canRevision ? (
          <ActionButton
            label="На доопрацювання"
            icon="fa-pen"
            variant="revision"
            disabled={isWorkflowBusy}
            onClick={() => handle("revision")}
          />
        ) : null}

        {canRejectAsReviewer || canRejectAsAuthor ? (
          <ActionButton
            label="Відхилити"
            icon="fa-xmark"
            variant="reject"
            disabled={isWorkflowBusy}
            onClick={() => handle("reject")}
          />
        ) : null}

        <ActionButton
          label="Історія"
          icon="fa-clock-rotate-left"
          onClick={() => setHistoryModalOpen(true)}
        />

        {!isTro ? (
          <ActionButton
            label="PDF"
            icon={loadingId === doc.id ? "fa-spinner" : "fa-file-pdf"}
            disabled={loadingId === doc.id}
            loading={loadingId === doc.id}
            onClick={() => onOpenPdf?.(doc.id)}
          />
        ) : null}
      </div>

      {historyModalOpen ? (
        <DocumentHistoryModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          documentId={doc.id}
        />
      ) : null}
    </>
  );
}
