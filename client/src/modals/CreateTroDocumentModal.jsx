import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSnackbar } from "notistack";
import CompactSelect from "../components/CompactSelect/CompactSelect.jsx";
import FormInput from "../components/FormControl/FormInput.jsx";
import { createDocument, updateDocument, updateTroAccounting } from "../services/documents.api.js";
import { ROLE_IDS } from "../utils/roles.js";
import { UI_TIMING } from "../uiTokens.js";
import styles from "./CreateTroDocumentModal.module.scss";

const EMPTY_ITEM = { troProductId: "", productName: "", quantity: 1 };

function accountName(user) {
  return user?.user_name || user?.userName || user?.fullName || user?.name || "";
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
  const [movementType, setMovementType] = useState("INSTALL");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [upDocumentNumber, setUpDocumentNumber] = useState("");
  const [executorName, setExecutorName] = useState("");
  const [appInstall, setAppInstall] = useState(false);
  const [photoInstall, setPhotoInstall] = useState(false);
  const [appReturn, setAppReturn] = useState(false);
  const [warehouseSpecReturn, setWarehouseSpecReturn] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAccountant = Number(currentUser?.role) === ROLE_IDS.Accountant;
  const accountingEditable =
    Boolean(editingDocument) && isAccountant && ["NOT_COMPLETED", "PLANNED"].includes(editingDocument.status);
  const generalEditable = !editingDocument || (!isViewOnly && ["NEW", "REVISION"].includes(editingDocument.status));

  useEffect(() => {
    if (!isOpen) return;
    if (!editingDocument) {
      setContractorId("");
      setContractorSearch("");
      setTradePointId("");
      setTaUserId(String(taOptions[0]?.id || ""));
      setMovementType("INSTALL");
      setComment("");
      setItems([{ ...EMPTY_ITEM }]);
      setUpDocumentNumber("");
      setExecutorName(isAccountant ? accountName(currentUser) : "");
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
    setMovementType(tro.movementType || "INSTALL");
    setComment(editingDocument.comment || "");
    setItems((tro.items || []).map((item) => ({
      troProductId: String(item.troProductId),
      productName: item.productName,
      quantity: Number(item.quantity),
    })));
    setUpDocumentNumber(tro.upDocumentNumber || "");
    setExecutorName(tro.executorName || (isAccountant ? accountName(currentUser) : ""));
    setAppInstall(Boolean(tro.appInstall));
    setPhotoInstall(Boolean(tro.photoInstall));
    setAppReturn(Boolean(tro.appReturn));
    setWarehouseSpecReturn(Boolean(tro.warehouseSpecReturn));
  }, [contractors, currentUser, editingDocument, isAccountant, isOpen, taOptions]);

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

  const productOptions = useMemo(() => {
    const options = troProducts.map((item) => ({
      value: item.id,
      label: item.group_name ? `${item.name} · ${item.group_name}` : item.name,
    }));
    for (const item of editingDocument?.tro?.items || []) {
      if (!options.some((option) => Number(option.value) === Number(item.troProductId))) {
        options.push({ value: item.troProductId, label: item.productName });
      }
    }
    return options;
  }, [editingDocument, troProducts]);

  const updateItem = (index, patch) => {
    setItems((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item));
  };

  const generalPayload = () => ({
    documentType: "TRO",
    contractorId: Number(contractorId),
    tradePointId: Number(tradePointId),
    taUserId: Number(taUserId),
    movementType,
    comment: comment.trim(),
    items: items.map((item) => ({
      troProductId: Number(item.troProductId),
      quantity: Number(item.quantity),
    })),
  });

  async function saveGeneral() {
    if (!contractorId || !tradePointId || !taUserId || !items.length ||
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
        upDocumentNumber,
        executorName,
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
              options={visibleTaOptions.map((item) => ({ value: item.id, label: item.name }))} onChange={setTaUserId} ariaLabel="ТА" /></div>
            <div className={styles.field}><label>Тип руху</label><CompactSelect value={movementType} disabled={!generalEditable}
              options={[{ value: "INSTALL", label: "Установка" }, { value: "RETURN", label: "Повернення" }]}
              onChange={setMovementType} ariaLabel="Тип руху" /></div>
            <div className={`${styles.field} ${styles.commentField}`}><label>Коментар</label><textarea maxLength={250} rows={2} value={comment} disabled={!generalEditable} onChange={(event) => setComment(event.target.value)} /></div>
          </section>

          <section className={styles.itemsSection}>
            <div className={styles.sectionTitle}><h3>ТРО</h3>{generalEditable ? <button type="button" onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}><i className="fa-solid fa-plus" /> Додати</button> : null}</div>
            <div className={styles.itemList}>{items.map((item, index) => (
              <div className={styles.itemRow} key={`${index}-${item.troProductId}`}>
                <CompactSelect value={item.troProductId} disabled={!generalEditable} options={productOptions}
                  onChange={(value) => updateItem(index, { troProductId: value, productName: troProducts.find((product) => String(product.id) === String(value))?.name || "" })}
                  ariaLabel={`ТРО ${index + 1}`} placement="top" />
                <FormInput type="number" min="0.001" step="0.001" value={item.quantity} disabled={!generalEditable}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })} aria-label="Кількість" />
                {generalEditable ? <button className={styles.removeItem} type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Видалити позицію"><i className="fa-solid fa-trash" /></button> : null}
              </div>
            ))}</div>
          </section>

          {editingDocument ? <section className={styles.accountingSection}>
            <h3>Заповнює бухгалтер</h3>
            <div className={styles.accountingGrid}>
              <div className={styles.field}><label>№ документа з УП</label><FormInput maxLength={20} value={upDocumentNumber} disabled={!accountingEditable} onChange={(event) => setUpDocumentNumber(event.target.value)} /></div>
              <div className={styles.field}><label>Виконавець</label><FormInput maxLength={150} value={executorName} disabled={!accountingEditable} onChange={(event) => setExecutorName(event.target.value)} /></div>
            </div>
            <div className={styles.checks}>
              {movementType === "INSTALL" ? <><label><FormInput type="checkbox" checked={appInstall} disabled={!accountingEditable} onChange={(event) => setAppInstall(event.target.checked)} /> АППУ · Акт приймання-передачі</label><label><FormInput type="checkbox" checked={photoInstall} disabled={!accountingEditable} onChange={(event) => setPhotoInstall(event.target.checked)} /> ФУ · Фото</label></> : <><label><FormInput type="checkbox" checked={appReturn} disabled={!accountingEditable} onChange={(event) => setAppReturn(event.target.checked)} /> АППВ · Акт приймання-передачі</label><label><FormInput type="checkbox" checked={warehouseSpecReturn} disabled={!accountingEditable} onChange={(event) => setWarehouseSpecReturn(event.target.checked)} /> ССВ · Складська специфікація</label></>}
            </div>
          </section> : null}
        </div>

        <footer className={styles.footer}>
          <button className={styles.secondary} type="button" onClick={onClose}>Закрити</button>
          {generalEditable ? <button className={styles.primary} type="button" disabled={saving} onClick={saveGeneral}>{saving ? "Збереження…" : "Зберегти"}</button> : null}
          {accountingEditable ? <><button className={styles.secondary} type="button" disabled={saving} onClick={() => saveAccounting(false)}>Зберегти дані</button><button className={styles.primary} type="button" disabled={saving} onClick={() => saveAccounting(true)}>Підтвердити виконання</button></> : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
