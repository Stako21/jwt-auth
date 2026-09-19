import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSnackbar } from "notistack";
import CompactSelect from "../components/CompactSelect/CompactSelect.jsx";
import { getOneCStageLabel } from "../components/Documents/oneCStage.js";
import { getTroPeople } from "../components/Documents/troPeople.js";
import FormInput from "../components/FormControl/FormInput.jsx";
import { createDocument, updateDocument, updateTroAccounting } from "../services/documents.api.js";
import { ROLE_IDS } from "../utils/roles.js";
import { UI_TIMING } from "../uiTokens.js";
import ItemModal from "./ItemModal.jsx";
import styles from "./CreateTroDocumentModal.module.scss";

const FALLBACK_TRO_GROUP = "Без групи";
const LEGACY_TRO_GROUP = "Раніше вибрані";

function getOneCRejection(document) {
  if (document?.status !== "REJECTED") return null;
  const history = Array.isArray(document.history) ? document.history : [];
  const event = [...history].reverse().find((item) => item.action === "ONE_C_REJECTED");
  if (!event) return null;

  const comment = String(event.comment || "");
  const reasonStart = comment.indexOf("\nПричина: ");
  const codeStart = comment.lastIndexOf("\nКод причини: ");
  let reason = comment;
  if (reasonStart >= 0 && codeStart > reasonStart) {
    reason = comment.slice(reasonStart + "\nПричина: ".length, codeStart);
    if (reason.endsWith(".")) reason = reason.slice(0, -1);
  } else {
    reason = comment.replace(/^\[[^\]]+\]\s*/, "");
  }

  return {
    responsibleName: document.tro?.rejectedBy1cName || "—",
    reason: reason.trim() || "—",
  };
}

export default function CreateTroDocumentModal({
  isOpen,
  onClose,
  onCreated,
  contractors,
  tradePoints,
  troProducts,
  taOptions,
  currentUser,
  editingDocument,
  isViewOnly = false,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [contractorId, setContractorId] = useState("");
  const [contractorSearch, setContractorSearch] = useState("");
  const [showContractors, setShowContractors] = useState(false);
  const [tradePointId, setTradePointId] = useState("");
  const [taUserId, setTaUserId] = useState("");
  const [salesAgentId, setSalesAgentId] = useState("");
  const [movementType, setMovementType] = useState("INSTALL");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState([]);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [appInstall, setAppInstall] = useState(false);
  const [photoInstall, setPhotoInstall] = useState(false);
  const [appReturn, setAppReturn] = useState(false);
  const [warehouseSpecReturn, setWarehouseSpecReturn] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAccountant = Number(currentUser?.role) === ROLE_IDS.Accountant;
  const accountingEditable =
    Boolean(editingDocument) && isAccountant && ["NOT_COMPLETED", "PLANNED"].includes(editingDocument.status);
  const generalEditable = !editingDocument || (!isViewOnly && ["NEW", "REVISION"].includes(editingDocument.status));
  const integrationPeople = getTroPeople({
    executorName: editingDocument?.tro?.executorName,
    oneCSalesAgentName: editingDocument?.tro?.oneCSalesAgentName,
    requestSalesAgentName: editingDocument?.tro?.requestSalesAgent?.name || editingDocument?.tro?.taName,
  });
  const oneCRejection = getOneCRejection(editingDocument);

  useEffect(() => {
    if (!isOpen) return;
    if (!editingDocument) {
      setContractorId("");
      setContractorSearch("");
      setTradePointId("");
      setTaUserId(String(taOptions[0]?.id || ""));
      const initialPositions = taOptions[0]?.positions || [];
      setSalesAgentId(initialPositions.length === 1 ? String(initialPositions[0].id) : "");
      setMovementType("INSTALL");
      setComment("");
      setItems([]);
      setIsItemModalOpen(false);
      setEditingItemIndex(null);
      setAppInstall(false);
      setPhotoInstall(false);
      setAppReturn(false);
      setWarehouseSpecReturn(false);
      return;
    }

    const contractor = contractors.find((item) =>
      Number(item.id) === Number(editingDocument.contractor?.id),
    );
    const tro = editingDocument.tro || {};
    setContractorId(String(contractor?.id || editingDocument.contractor?.id || ""));
    setContractorSearch(contractor?.name || editingDocument.contractor?.name || "");
    setTradePointId(String(editingDocument.tradePoint?.id || ""));
    setTaUserId(String(tro.taUserId || ""));
    setSalesAgentId(String(tro.requestSalesAgent?.id || tro.requestSalesAgentId || ""));
    setMovementType(tro.movementType || "INSTALL");
    setComment(editingDocument.comment || "");
    setItems((tro.items || []).map((item) => ({
      troProductId: String(item.troProductId),
      productName: item.productName,
      quantity: Number(item.quantity),
    })));
    setAppInstall(Boolean(tro.appInstall));
    setPhotoInstall(Boolean(tro.photoInstall));
    setAppReturn(Boolean(tro.appReturn));
    setWarehouseSpecReturn(Boolean(tro.warehouseSpecReturn));
  }, [contractors, editingDocument, isOpen, taOptions]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  const filteredContractors = useMemo(() => {
    const query = contractorSearch.trim().toLocaleLowerCase("uk");
    return contractors.filter((item) => !query || item.name.toLocaleLowerCase("uk").includes(query));
  }, [contractorSearch, contractors]);

  const filteredTradePoints = useMemo(() => {
    const matches = tradePoints.filter(
      (item) => Number(item.contractor_id) === Number(contractorId),
    );
    const selected = editingDocument?.tradePoint;
    if (selected?.id && !matches.some((item) => Number(item.id) === Number(selected.id))) {
      return [...matches, { ...selected, contractor_id: contractorId }];
    }
    return matches;
  }, [contractorId, editingDocument, tradePoints]);

  const visibleTaOptions = useMemo(() => {
    const options = [...taOptions];
    const tro = editingDocument?.tro;
    if (tro?.taUserId && !options.some((item) => Number(item.id) === Number(tro.taUserId))) {
      options.push({ id: tro.taUserId, name: tro.taName });
    }
    return options;
  }, [editingDocument, taOptions]);

  const selectedTa = visibleTaOptions.find((item) => Number(item.id) === Number(taUserId));
  const activePositions = selectedTa?.positions || [];
  const savedPosition = editingDocument?.tro?.requestSalesAgent;
  const visiblePositions = useMemo(() => {
    const positions = [...activePositions];
    if (savedPosition?.id && !positions.some((item) => Number(item.id) === Number(savedPosition.id))) {
      positions.push({
        id: savedPosition.id,
        login: savedPosition.login,
        agentGuid: savedPosition.guid,
        agentName: savedPosition.name,
        routeGuid: savedPosition.routeGuid,
        routeName: savedPosition.routeName,
        assortmentGuid: savedPosition.assortmentGuid,
        assortmentName: savedPosition.assortmentName,
        historical: true,
      });
    }
    return positions;
  }, [activePositions, savedPosition]);
  const selectedPosition = visiblePositions.find((item) => Number(item.id) === Number(salesAgentId));
  const preservedSavedPosition = Boolean(
    editingDocument && savedPosition?.id
    && Number(savedPosition.id) === Number(salesAgentId)
    && Number(editingDocument.tro?.taUserId) === Number(taUserId),
  );
  const positionProblem = !taUserId || (activePositions.length === 0 && !preservedSavedPosition)
    ? "Для торгового агента не настроена активная позиция 1С"
    : activePositions.length > 1 && !salesAgentId
      ? "Выберите конкретную позицию 1С торгового агента"
      : "";

  const changeTa = (value) => {
    setTaUserId(String(value));
    const positions = taOptions.find((item) => Number(item.id) === Number(value))?.positions || [];
    setSalesAgentId(positions.length === 1 ? String(positions[0].id) : "");
  };

  const positionLabel = (position) => [
    position.assortmentName || "Без асортименту",
    position.login || "Без логіна",
    position.routeName || "Без маршруту",
  ].join(" — ");

  const modalProducts = useMemo(() => {
    const products = troProducts.map((item) => ({
      ...item,
      group_id: `tro-group:${item.group_name || FALLBACK_TRO_GROUP}`,
    }));
    for (const item of editingDocument?.tro?.items || []) {
      if (!products.some((product) => Number(product.id) === Number(item.troProductId))) {
        products.push({
          id: item.troProductId,
          name: item.productName,
          group_id: `tro-group:${LEGACY_TRO_GROUP}`,
          group_name: LEGACY_TRO_GROUP,
        });
      }
    }
    return products;
  }, [editingDocument, troProducts]);

  const troProductGroups = useMemo(() => {
    const groups = new Map();
    for (const product of modalProducts) {
      const groupId = String(product.group_id);
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          name: product.group_name || FALLBACK_TRO_GROUP,
        });
      }
    }
    return [...groups.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "uk"));
  }, [modalProducts]);

  const getProductLabel = (item) =>
    modalProducts.find(
      (product) => String(product.id) === String(item.troProductId),
    )?.name || item.productName || "";

  const openAddItem = () => {
    setEditingItemIndex(null);
    setIsItemModalOpen(true);
  };

  const openEditItem = (index) => {
    setEditingItemIndex(index);
    setIsItemModalOpen(true);
  };

  const handleSaveItem = (item) => {
    const product = modalProducts.find(
      (candidate) => String(candidate.id) === String(item.productId),
    );
    const nextItem = {
      troProductId: String(item.productId),
      productName: product?.name || "",
      quantity: item.quantity,
    };

    setItems((current) => {
      const withoutEdited = editingItemIndex === null
        ? current
        : current.filter((_, index) => index !== editingItemIndex);
      const nextNameKey = nextItem.productName.trim().toLocaleLowerCase("uk");
      const duplicateIndex = withoutEdited.findIndex((currentItem) =>
        getProductLabel(currentItem).trim().toLocaleLowerCase("uk") === nextNameKey);

      if (duplicateIndex < 0) {
        if (editingItemIndex === null) return [...withoutEdited, nextItem];
        const result = [...withoutEdited];
        result.splice(editingItemIndex, 0, nextItem);
        return result;
      }

      return withoutEdited.map((currentItem, index) => index === duplicateIndex
        ? {
            ...currentItem,
            quantity: Number(currentItem.quantity) + Number(nextItem.quantity),
          }
        : currentItem);
    });
  };

  const removeItem = (index) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const copyProductLabel = async (item) => {
    const label = getProductLabel(item);
    if (!label) return;

    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(label);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        const copyField = document.createElement("textarea");
        copyField.value = label;
        copyField.style.position = "fixed";
        copyField.style.opacity = "0";
        document.body.appendChild(copyField);
        copyField.select();
        copied = document.execCommand("copy");
        copyField.remove();
        if (!copied) throw new Error("Copy command failed");
      }
      enqueueSnackbar("Назву ТРО скопійовано", { variant: "success" });
    } catch (error) {
      console.error("Failed to copy TRO product name:", error);
      enqueueSnackbar("Не вдалося скопіювати назву ТРО", { variant: "error" });
    }
  };

  const generalPayload = () => ({
    documentType: "TRO",
    contractorId: Number(contractorId),
    tradePointId: Number(tradePointId),
    taUserId: Number(taUserId),
    ...(salesAgentId && !preservedSavedPosition ? { salesAgentId: Number(salesAgentId) } : {}),
    movementType,
    comment: comment.trim(),
    items: items.map((item) => ({
      troProductId: Number(item.troProductId),
      quantity: Number(item.quantity),
    })),
  });

  async function saveGeneral() {
    if (!contractorId || !tradePointId || !taUserId || positionProblem || !items.length ||
      items.some((item) => !item.troProductId || Number(item.quantity) <= 0)) {
      enqueueSnackbar("Заповніть контрагента, торгову точку, ТА та позиції ТРО", { variant: "warning" });
      return;
    }
    setSaving(true);
    try {
      if (editingDocument) await updateDocument(editingDocument.id, generalPayload());
      else await createDocument(generalPayload());
      await onCreated?.();
      onClose();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.message || "Не вдалося зберегти документ ТРО", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function saveAccounting(confirmCompleted = false) {
    setSaving(true);
    try {
      await updateTroAccounting(editingDocument.id, {
        appInstall,
        photoInstall,
        appReturn,
        warehouseSpecReturn,
        confirmCompleted,
      });
      await onCreated?.();
      onClose();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.message || "Не вдалося зберегти дані бухгалтера", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tro-modal-title">
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрити" />
      <div className={styles.card}>
        <header className={styles.header}>
          <div>
            <h2 id="tro-modal-title">{editingDocument ? "Документ ТРО" : "Новий документ ТРО"}</h2>
            <p>{editingDocument?.documentNumber || "Номер буде створено автоматично"} · {editingDocument?.createdAt ? new Date(editingDocument.createdAt).toLocaleString("uk-UA") : "дата і час — при створенні"}</p>
          </div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Закрити"><i className="fa-solid fa-xmark" /></button>
        </header>

        <div className={styles.body}>
          <section className={styles.generalSection}>
            <div className={styles.field}>
              <label>Контрагент</label>
              <div className={styles.autocomplete}>
                <FormInput value={contractorSearch} disabled={!generalEditable} placeholder="Почніть вводити назву"
                  onChange={(event) => { setContractorSearch(event.target.value); setContractorId(""); setTradePointId(""); setShowContractors(true); }}
                  onFocus={() => setShowContractors(true)}
                  onBlur={() => window.setTimeout(() => setShowContractors(false), UI_TIMING.dropdownBlurDelayMs)} />
                {showContractors && generalEditable ? <div className={styles.options}>
                  {filteredContractors.map((item) => <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { setContractorId(String(item.id)); setContractorSearch(item.name); setTradePointId(""); setShowContractors(false); }}>{item.name}</button>)}
                </div> : null}
              </div>
            </div>

            <div className={styles.field}><label>Торгова точка</label><CompactSelect value={tradePointId} disabled={!generalEditable || !contractorId}
              options={filteredTradePoints.map((item) => ({ value: item.id, label: item.address ? `${item.name} · ${item.address}` : item.name }))}
              onChange={setTradePointId} ariaLabel="Торгова точка" /></div>
            <div className={styles.field}><label>ТА</label><CompactSelect value={taUserId} disabled={!generalEditable || Number(currentUser?.role) === ROLE_IDS.TA}
              options={visibleTaOptions.map((item) => ({ value: item.id, label: item.name }))} onChange={changeTa} ariaLabel="ТА" /></div>
            <div className={`${styles.field} ${styles.positionField}`}>
              <label>Маршрут ТА 1С</label>
              <CompactSelect
                value={salesAgentId}
                disabled={!generalEditable || (activePositions.length <= 1 && Boolean(salesAgentId))}
                options={visiblePositions.map((item) => ({
                  value: item.id,
                  label: `${positionLabel(item)}${item.historical ? " (історична)" : ""}`,
                }))}
                onChange={setSalesAgentId}
                ariaLabel="Маршрут ТА 1С"
                placeholder="Оберіть маршрут"
              />
              {positionProblem ? <p className={styles.positionError}>{positionProblem}</p> : null}
              {selectedPosition ? <p className={styles.positionSummary}>
                Асортимент: {selectedPosition.assortmentName || "—"} · Логін: {selectedPosition.login || "—"}<br />
                Маршрут: {selectedPosition.routeName || "—"}
              </p> : null}
            </div>
            <div className={styles.field}><label>Тип руху</label><CompactSelect value={movementType} disabled={!generalEditable}
              options={[{ value: "INSTALL", label: "Установка" }, { value: "RETURN", label: "Повернення" }]}
              onChange={setMovementType} ariaLabel="Тип руху" /></div>
            <div className={`${styles.field} ${styles.commentField}`}><label>Коментар</label><textarea maxLength={250} rows={2} value={comment} disabled={!generalEditable} onChange={(event) => setComment(event.target.value)} /></div>
          </section>

          <section className={styles.itemsSection}>
            <div className={styles.sectionTitle}><h3>ТРО</h3>{generalEditable ? <button type="button" onClick={openAddItem}><i className="fa-solid fa-plus" /> Додати позицію</button> : null}</div>
            {items.length === 0 ? (
              <p className={styles.emptyItems}>Позиції ще не додані</p>
            ) : (
              <div className={styles.itemsTableScroll}>
                <table className={`table ${styles.itemsTable}`}>
                  <thead><tr><th>ТРО</th><th>Кількість</th><th aria-label="Дії" /></tr></thead>
                  <tbody>{items.map((item, index) => (
                    <tr key={`${item.troProductId}-${index}`}>
                      <td><span className={styles.copyableProductName}>{getProductLabel(item)}</span></td>
                      <td>{item.quantity}</td>
                      <td>
                        {editingDocument ? <button className={styles.itemActionButton} type="button" title="Копіювати назву ТРО" aria-label={`Копіювати назву ТРО ${index + 1}`} onClick={() => copyProductLabel(item)}><i className="fa-regular fa-copy" aria-hidden="true" /></button> : null}
                        {generalEditable ? <button className={styles.itemActionButton} type="button" aria-label="Редагувати позицію" onClick={() => openEditItem(index)}><i className="fa-solid fa-pencil" aria-hidden="true" /></button> : null}
                        {generalEditable ? <button className={`${styles.itemActionButton} ${styles.removeItemButton}`} type="button" aria-label="Видалити позицію" onClick={() => removeItem(index)}><i className="fa-solid fa-xmark" aria-hidden="true" /></button> : null}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          {oneCRejection ? <section className={styles.rejectionSection}>
            <h3>Відхилення в УП</h3>
            <div className={styles.rejectionGrid}>
              <div className={styles.field}>
                <label>Відхилив в УП</label>
                <p className={styles.rejectionValue}>{oneCRejection.responsibleName}</p>
              </div>
              <div className={styles.field}>
                <label>Причина відхилення</label>
                <p className={styles.rejectionValue}>{oneCRejection.reason}</p>
              </div>
            </div>
          </section> : null}

          {editingDocument && !oneCRejection ? <section className={styles.accountingSection}>
            <h3>Заповнює бухгалтер</h3>
            <div className={styles.accountingGrid}>
              <div className={styles.field}><label>№ документа з УП</label><FormInput value={editingDocument.tro?.upDocumentNumber || "—"} readOnly /></div>
              <div className={styles.field}><label>Виконавець</label><FormInput value={integrationPeople.executorName} readOnly /></div>
              <div className={styles.field}><label>Запитаний ТА</label><FormInput value={editingDocument.tro?.requestSalesAgent?.name || editingDocument.tro?.taName || "—"} readOnly /></div>
              <div className={styles.field}><label>ТА в 1С</label><FormInput value={editingDocument.tro?.oneCSalesAgentName || "—"} readOnly /></div>
              <div className={styles.field}><label>Дата документа УП</label><FormInput value={editingDocument.tro?.document1cDate ? new Date(editingDocument.tro.document1cDate).toLocaleString("uk-UA") : "—"} readOnly /></div>
              <div className={styles.field}><label>Стан в УП</label><FormInput value={getOneCStageLabel(editingDocument.tro?.oneCStage)} readOnly /></div>
            </div>
            <div className={styles.checks}>
              {movementType === "INSTALL" ? <><label><FormInput type="checkbox" checked={appInstall} disabled={!accountingEditable} onChange={(event) => setAppInstall(event.target.checked)} /> Акт</label><label><FormInput type="checkbox" checked={photoInstall} disabled={!accountingEditable} onChange={(event) => setPhotoInstall(event.target.checked)} /> Фото</label></> : <><label><FormInput type="checkbox" checked={appReturn} disabled={!accountingEditable} onChange={(event) => setAppReturn(event.target.checked)} /> Акт</label><label><FormInput type="checkbox" checked={warehouseSpecReturn} disabled={!accountingEditable} onChange={(event) => setWarehouseSpecReturn(event.target.checked)} /> Специфікація</label></>}
            </div>
          </section> : null}
        </div>

        <footer className={styles.footer}>
          <button className={styles.secondary} type="button" onClick={onClose}>Закрити</button>
          {generalEditable ? <button className={styles.primary} type="button" disabled={saving || Boolean(positionProblem)} onClick={saveGeneral}>{saving ? "Збереження…" : "Зберегти"}</button> : null}
          {accountingEditable ? <><button className={styles.secondary} type="button" disabled={saving} onClick={() => saveAccounting(false)}>Зберегти дані</button><button className={styles.primary} type="button" disabled={saving} onClick={() => saveAccounting(true)}>Підтвердити виконання</button></> : null}
        </footer>
      </div>
      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSave={handleSaveItem}
        initialItem={editingItemIndex === null ? null : {
          productId: items[editingItemIndex]?.troProductId,
          quantity: items[editingItemIndex]?.quantity,
        }}
        productGroups={troProductGroups}
        products={modalProducts}
        datesRequired={false}
        showUnit={false}
        showDates={false}
        productLabel="ТРО"
        productPlaceholder="Почніть вводити назву ТРО"
      />
    </div>,
    document.body,
  );
}
