import { useEffect, useRef, useState } from "react";
import { openDocumentPdf } from "../../services/documents.api";
import { ROLE_IDS } from "../../utils/roles.js";
import FormInput from "../FormControl/FormInput.jsx";
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

function troRequiredDocuments(doc) {
  if (doc.tro_movement_type === "INSTALL") {
    return [
      {
        code: "АППУ",
        text: "Акт",
        label: "Акт приймання-передачі",
        checked: Number(doc.tro_app_install) === 1,
      },
      {
        code: "ФУ",
        text: "Фото",
        label: "Фото",
        checked: Number(doc.tro_photo_install) === 1,
      },
    ];
  }

  if (doc.tro_movement_type === "RETURN") {
    return [
      {
        code: "АППВ",
        text: "Акт",
        label: "Акт приймання-передачі",
        checked: Number(doc.tro_app_return) === 1,
      },
      {
        code: "ССВ",
        text: "Специфікація",
        label: "Складська специфікація",
        checked: Number(doc.tro_warehouse_spec_return) === 1,
      },
    ];
  }

  return [];
}

function TroRequiredDocuments({ doc }) {
  const requiredDocuments = troRequiredDocuments(doc);

  return (
    <div
      className={style.troRequiredDocuments}
      aria-label="Документи для підтвердження"
    >
      {requiredDocuments.map((item) => (
        <span
          className={
            item.checked ? style.troDocumentReady : style.troDocumentMissing
          }
          key={item.code}
          title={`${item.label}: ${item.checked ? "є" : "немає"}`}
          aria-label={`${item.label}: ${item.checked ? "є" : "немає"}`}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}

function SelectionCheckbox({ checked, indeterminate = false, onChange, label }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <FormInput
      ref={inputRef}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  );
}

export default function DocumentTable({
  documents,
  category = "return-exchange",
  currentUser,
  reloadDocuments,
  onEditDocument,
  onViewDocument,
  selectedIds,
  onToggleSelection,
  onToggleAll,
}) {
  const [loadingId, setLoadingId] = useState(null);
  const isTroTable = category === "tro";
  const showBranchColumn = documents.some(
    (doc) => Number(doc.branch_id) !== Number(currentUser.branchId),
  );
  const selectedCount = documents.reduce(
    (count, doc) => count + Number(selectedIds.has(Number(doc.id))),
    0,
  );
  const allSelected = documents.length > 0 && selectedCount === documents.length;
  const partiallySelected = selectedCount > 0 && !allSelected;

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
            isTroTable ? style.troTable : ""
          } ${showBranchColumn ? style.withBranch : ""}`}
        >
          <colgroup>
            <col className={style.selectionColumn} />
            <col className={style.statusColumn} />
            <col className={style.numberColumn} />
            {showBranchColumn ? <col className={style.branchColumn} /> : null}
            <col className={style.typeColumn} />
            <col className={style.tradePointColumn} />
            <col className={style.contractorColumn} />
            <col
              className={`${style.authorColumn} ${
                isTroTable ? style.troAuthorColumn : ""
              }`}
            />
            {isTroTable ? <col className={style.troDocumentsColumn} /> : null}
            <col className={style.dateColumn} />
            <col className={style.actionsColumn} />
          </colgroup>
          <thead>
            <tr>
              <th className={style.selectionCell}>
                <SelectionCheckbox
                  checked={allSelected}
                  indeterminate={partiallySelected}
                  onChange={onToggleAll}
                  label="Вибрати всі показані документи"
                />
              </th>
              <th aria-label="Статус">
                <i className="fa-regular fa-flag" aria-hidden="true"></i>
              </th>
              <th>№</th>
              {showBranchColumn ? <th>Філія</th> : null}
              <th>{isTroTable ? "Рух" : "Тип"}</th>
              <th>Торгова точка</th>
              <th>Контрагент</th>
              <th>{isTroTable ? "Автор / ТА" : "Автор"}</th>
              {isTroTable ? <th>Документи</th> : null}
              <th>Дата</th>
              <th className={style.actionsHeader}>Дії</th>
            </tr>
          </thead>

          <tbody>
            {documents.map((doc) => (
              <tr
                data-selected={selectedIds.has(Number(doc.id)) || undefined}
                key={doc.id}
                onClick={(event) => handleDocumentOpen(event, doc)}
              >
                <td className={style.selectionCell}>
                  <SelectionCheckbox
                    checked={selectedIds.has(Number(doc.id))}
                    onChange={() => onToggleSelection(doc.id)}
                    label={`Вибрати документ ${doc.document_number}`}
                  />
                </td>
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
                  {isTroTable
                    ? troMovementLabel(doc.tro_movement_type)
                    : documentTypeLabel(doc.document_type)}
                </td>
                <td title={doc.trade_point}>{doc.trade_point}</td>
                <td title={doc.contractor}>{doc.contractor}</td>
                <td className={isTroTable ? style.personCell : ""} title={doc.author}>
                  <span>{doc.author}</span>
                  {isTroTable && doc.tro_ta_name ? <small>ТА: {doc.tro_ta_name}</small> : null}
                </td>
                {isTroTable ? (
                  <td>
                    <TroRequiredDocuments doc={doc} />
                  </td>
                ) : null}
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
            data-selected={selectedIds.has(Number(doc.id)) || undefined}
            key={doc.id}
            onClick={(event) => handleDocumentOpen(event, doc)}
          >
            <div className={style.cardHeader}>
              <div className={style.cardHeaderStatus}>
                <SelectionCheckbox
                  checked={selectedIds.has(Number(doc.id))}
                  onChange={() => onToggleSelection(doc.id)}
                  label={`Вибрати документ ${doc.document_number}`}
                />
                <StatusBadge status={doc.status} showLabel />
              </div>
              <strong>№ {doc.document_number}</strong>
            </div>

            <div className={style.cardMeta}>
              <span>
                {isTroTable
                  ? troMovementLabel(doc.tro_movement_type)
                  : documentTypeLabel(doc.document_type)}
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
              {isTroTable ? (
                <div className={style.cardRequiredDocuments}>
                  <span>Документи:</span>
                  <TroRequiredDocuments doc={doc} />
                </div>
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
