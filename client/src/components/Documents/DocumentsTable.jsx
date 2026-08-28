import { useState } from "react";
import { openDocumentPdf } from "../../services/documents.api";
import { ROLE_IDS } from "../../utils/roles.js";
import DocumentRowActions from "./DocumentRowAction";
import StatusBadge from "./StatusBadge";
import style from "./DocumentsTable.module.scss";

function formatDocumentDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function documentTypeLabel(type) {
  if (type === "RETURN") return "ПОВЕРНЕННЯ";
  if (type === "TRO") return "ТРО";
  return "ОБМІН";
}

function troMovementLabel(value) {
  if (value === "INSTALL") return "Установка";
  if (value === "RETURN") return "Повернення";
  return "";
}

export default function DocumentTable({
  documents,
  currentUser,
  reloadDocuments,
  onEditDocument,
  onViewDocument,
}) {
  const [loadingId, setLoadingId] = useState(null);
  const showBranchColumn = documents.some(
    (doc) => Number(doc.branch_id) !== Number(currentUser.branchId),
  );

  const handleOpenPdf = async (id) => {
    try {
      setLoadingId(id);
      await openDocumentPdf(id);
    } catch (error) {
      console.error("Error opening PDF:", error);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDocumentOpen = (event, doc) => {
    if (event.target.closest("button, a, input, select, summary")) return;

    const canEditTroAccounting =
      doc.document_type === "TRO" &&
      Number(currentUser.role) === ROLE_IDS.Accountant &&
      ["NOT_COMPLETED", "PLANNED"].includes(doc.status);
    const canEdit = canEditTroAccounting ||
      (["NEW", "REVISION"].includes(doc.status) &&
        (Number(doc.author_user_id) === Number(currentUser.id) ||
          Number(currentUser.role) === ROLE_IDS.SV));

    if (canEdit) {
      onEditDocument?.(doc);
      return;
    }
    onViewDocument?.(doc);
  };

  if (!documents.length) {
    return <div className={style.emptyState}>Документів не знайдено</div>;
  }

  const renderActions = (doc) => (
    <DocumentRowActions
      doc={doc}
      currentUser={currentUser}
      onUpdated={reloadDocuments}
      onOpenPdf={handleOpenPdf}
      loadingId={loadingId}
      setLoadingId={setLoadingId}
    />
  );

  return (
    <>
      <div className={style.desktopTableContainer}>
        <table
          className={`${style.documentsTable} ${
            showBranchColumn ? style.withBranch : ""
          }`}
        >
          <colgroup>
            <col className={style.statusColumn} />
            <col className={style.numberColumn} />
            {showBranchColumn ? <col className={style.branchColumn} /> : null}
            <col className={style.typeColumn} />
            <col className={style.tradePointColumn} />
            <col className={style.contractorColumn} />
            <col className={style.authorColumn} />
            <col className={style.dateColumn} />
            <col className={style.actionsColumn} />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Статус">
                <i className="fa-regular fa-flag" aria-hidden="true"></i>
              </th>
              <th>№</th>
              {showBranchColumn ? <th>Філія</th> : null}
              <th>Тип</th>
              <th>Торгова точка</th>
              <th>Контрагент</th>
              <th>Автор</th>
              <th>Дата</th>
              <th className={style.actionsHeader}>Дії</th>
            </tr>
          </thead>

          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} onClick={(event) => handleDocumentOpen(event, doc)}>
                <td className={style.statusCell}>
                  <StatusBadge status={doc.status} />
                </td>
                <td className={style.noTruncate}>{doc.document_number}</td>
                {showBranchColumn ? (
                  <td title={doc.branch_short_name || doc.branch_name || ""}>
                    {doc.branch_short_name || doc.branch_name || "—"}
                  </td>
                ) : null}
                <td className={style.documentType}>
                  {documentTypeLabel(doc.document_type)}
                  {doc.tro_movement_type ? ` · ${troMovementLabel(doc.tro_movement_type)}` : ""}
                </td>
                <td title={doc.trade_point}>{doc.trade_point}</td>
                <td title={doc.contractor}>{doc.contractor}</td>
                <td title={doc.author}>{doc.author}</td>
                <td className={style.documentDate}>
                  {formatDocumentDate(doc.document_date)}
                </td>
                <td className={style.actionsCell}>{renderActions(doc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={style.mobileCards}>
        {documents.map((doc) => (
          <article
            className={style.documentCard}
            data-status={doc.status}
            key={doc.id}
            onClick={(event) => handleDocumentOpen(event, doc)}
          >
            <div className={style.cardHeader}>
              <StatusBadge status={doc.status} showLabel />
              <strong>№ {doc.document_number}</strong>
            </div>

            <div className={style.cardMeta}>
              <span>
                {documentTypeLabel(doc.document_type)}
                {doc.tro_movement_type ? ` · ${troMovementLabel(doc.tro_movement_type)}` : ""}
              </span>
              <time>{formatDocumentDate(doc.document_date)}</time>
            </div>

            <div className={style.cardDetails}>
              <p title={doc.trade_point}>
                <i className="fa-solid fa-store" aria-hidden="true"></i>
                <span>{doc.trade_point}</span>
              </p>
              <p title={doc.contractor}>
                <i className="fa-solid fa-building" aria-hidden="true"></i>
                <span>{doc.contractor}</span>
              </p>
              <p title={doc.author}>
                <i className="fa-regular fa-user" aria-hidden="true"></i>
                <span>{doc.author}</span>
              </p>
              {doc.tro_ta_name ? (
                <p title={doc.tro_ta_name}>
                  <i className="fa-solid fa-user-tag" aria-hidden="true"></i>
                  <span>ТА: {doc.tro_ta_name}</span>
                </p>
              ) : null}
              {showBranchColumn ? (
                <p>
                  <i className="fa-regular fa-building" aria-hidden="true"></i>
                  <span>{doc.branch_short_name || doc.branch_name || "—"}</span>
                </p>
              ) : null}
            </div>

            <div className={style.cardActions}>{renderActions(doc)}</div>
          </article>
        ))}
      </div>
    </>
  );
}
