import { useMemo, useState, useEffect } from "react";
import {
  createDocument,
  updateDocument,
  getDocumentById,
} from "../services/documents.api";
import ItemModal from "./ItemModal";
import { getUnitLabel } from "../utils/unitLabels";
import { useSnackbar } from "notistack";
import styles from "./CreateReturnDocumentModal.module.scss";

export default function CreateReturnDocumentModal({
  isOpen,
  onClose,
  onCreated,
  contractors,
  tradePoints,
  productGroups,
  products,
  editingDocument,
  isViewOnly = false,
}) {

  /* ---------------- state ---------------- */
  const [contractorId, setContractorId] = useState("");
  const [tradePointId, setTradePointId] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [executorType, setExecutorType] = useState("TA");

  const [contractorSearch, setContractorSearch] = useState("");
  const [showContractorDropdown, setShowContractorDropdown] = useState(false);

  const [items, setItems] = useState([]);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [errors, setErrors] = useState({});
  const { enqueueSnackbar } = useSnackbar();

  /* Запретить скролл страницы при открытом модальном окне */
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    } else {
      const scrollY = parseInt(document.body.style.top || "0") * -1;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Загружаем данные документа для редактирования
  useEffect(() => {
    if (editingDocument && isOpen) {

      // Получаем ID контрагента - может быть строка или объект
      let contractorId = "";
      if (
        typeof editingDocument.contractor === "object" &&
        editingDocument.contractor
      ) {
        // Ищем контрагента по имени в списке
        const found = contractors.find(
          (c) => c.name === editingDocument.contractor.name,
        );
        contractorId = found ? found.id.toString() : "";
      } else {
        contractorId = editingDocument.contractorId?.toString() || "";
      }

      setContractorId(contractorId);
      setContractorSearch(
        typeof editingDocument.contractor === "object"
          ? editingDocument.contractor.name || ""
          : editingDocument.contractor || "",
      );

      // Получаем ID торговой точки - может быть строка или объект
      let tradePointId = "";
      if (
        typeof editingDocument.tradePoint === "object" &&
        editingDocument.tradePoint
      ) {
        const found = tradePoints.find(
          (tp) => tp.name === editingDocument.tradePoint.name,
        );
        tradePointId = found ? found.id.toString() : "";
      } else {
        tradePointId = editingDocument.tradePointId?.toString() || "";
      }

      setTradePointId(tradePointId);
      setReason(editingDocument.reason || "");
      setComment(editingDocument.comment || "");
      setExecutorType(editingDocument.executorType || "TA");

      // Преобразуем items в нужный формат
      if (editingDocument.items && Array.isArray(editingDocument.items)) {
        const formattedItems = editingDocument.items.map((item) => ({
          productId: item.product_id || item.productId,
          product: item.product_name || item.productName,
          unit: item.unit,
          quantity: item.quantity,
          manufactureDate: formatDateForInput(
            item.manufacture_date || item.manufactureDate,
          ),
          expiryDate: formatDateForInput(item.expiry_date || item.expiryDate),
        }));
        setItems(formattedItems);
      }
    } else if (!editingDocument) {
      // Очищаем форму когда нет редактируемого документа
      reset();
    }
  }, [editingDocument, isOpen, contractors, tradePoints]);


  function validateDocument() {
    const e = {};

    if (!contractorId) e.contractorId = true;
    if (!tradePointId) e.tradePointId = true;
    if (!reason.trim()) e.reason = true;
    if (items.length === 0) e.items = true;


    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ---------------- helpers ---------------- */
  function reset() {
    setContractorSearch("");
    setContractorId("");
    setTradePointId("");
    setReason("");
    setComment("");
    setExecutorType("TA");
    setItems([]);
  }

  // Преобразуем дату из ISO формата в yyyy-MM-dd
  function formatDateForInput(dateStr) {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toISOString().slice(0, 10);
    } catch (e) {
      return dateStr;
    }
  }

  /* ---------------- filters ---------------- */
  const filteredTradePoints = useMemo(() => {
    if (!contractorId) return [];
    return tradePoints.filter(
      (tp) => tp.contractor_id === Number(contractorId),
    );
  }, [contractorId, tradePoints]);

  const filteredContractors = useMemo(() => {
    const searchStr = String(contractorSearch || "").trim();
    if (!searchStr) return [];
    return contractors.filter((c) =>
      c.name.toLowerCase().includes(searchStr.toLowerCase()),
    );
  }, [contractorSearch, contractors]);

  /* ---------------- item modal ---------------- */
  function openAddItem() {
    if (isViewOnly) return;
    setEditingIndex(null);
    setIsItemModalOpen(true);
  }

  function openEditItem(index) {
    if (isViewOnly) return;
    setEditingIndex(index);
    setIsItemModalOpen(true);
  }

  function handleSaveItem(item) {
    if (editingIndex === null) {
      setItems([...items, item]);
    } else {
      const copy = [...items];
      copy[editingIndex] = item;
      setItems(copy);
    }
  }

  function removeItem(index) {
    if (isViewOnly) return;
    setItems(items.filter((_, i) => i !== index));
  }

  /* ---------------- submit ---------------- */
  async function handleSubmit() {
    if (isViewOnly) return;

    if (!validateDocument()) return;

    try {
      const payload = {
        documentType: "RETURN",
        documentDate: new Date().toISOString().slice(0, 10),
        tradePointId: Number(tradePointId),
        reason,
        comment,
        executorType,
        items: items.map((i) => ({
          productId: Number(i.productId),
          unit: i.unit,
          quantity: Number(i.quantity),
          manufactureDate: i.manufactureDate,
          expiryDate: i.expiryDate,
          operation: "TAKE",
        })),
      };

      if (editingDocument) {
        // Редактирование
        await updateDocument(editingDocument.id, payload);
      } else {
        // Создание нового
        await createDocument(payload);
      }

      onCreated();
      reset();
      onClose();
    } catch (e) {
      const message =
        e.response?.data?.message || "Помилка при збереженні документу";
      enqueueSnackbar(message, { variant: "error" });
    }
  }

  const isSaveDisabled =
    isViewOnly ||
    !contractorId ||
    !tradePointId ||
    !reason.trim() ||
    items.length === 0;

  if (!isOpen) return null;

  /* ---------------- render ---------------- */
  return (
    <>
      <div className={`modal is-active ${styles.documentModal}`}>
        <div
          className={`modal-background ${styles.modalBackdrop}`}
          onClick={onClose}
        />

        <div className={`modal-card ${styles.modalCard}`}>
          <header className={`modal-card-head ${styles.modalHeader}`}>
            <p className={`modal-card-title ${styles.modalTitle}`}>
              {editingDocument
                ? "Редагувати документ — Повернення"
                : "Новий документ — Повернення"}
            </p>
            <button
              className={`delete ${styles.closeButton}`}
              type="button"
              onClick={onClose}
              aria-label="Закрити"
            />
          </header>

          <section className={`modal-card-body ${styles.modalBody}`}>
            {/* Контрагент */}
            <div className="field">
              <label className="label">Контрагент</label>
              <div className="control" style={{ position: "relative" }}>
                <input
                  className={`input ${errors.contractorId ? "is-danger" : ""}`}
                  placeholder="Почніть вводити назву"
                  value={contractorSearch}
                  disabled={isViewOnly}
                  onChange={(e) => {
                    setContractorSearch(e.target.value);
                    setShowContractorDropdown(true);
                    setContractorId("");
                    setTradePointId("");
                  }}
                  onFocus={() => setShowContractorDropdown(true)}
                  onBlur={() =>
                    setTimeout(() => setShowContractorDropdown(false), 200)
                  }
                />
                {errors.contractorId && (
                  <p className="help is-danger">Оберіть контрагента</p>
                )}

                {showContractorDropdown && filteredContractors.length > 0 && (
                  <div className={`dropdown-content ${styles.dropdownContent}`}>
                    {filteredContractors.map((c) => (
                      <div
                        key={c.id}
                        className={`dropdown-item ${styles.dropdownItem}`}
                        onMouseDown={() => {
                          setContractorSearch(c.name);
                          setContractorId(c.id);
                          setTradePointId("");
                          setShowContractorDropdown(false);
                        }}
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Торгова точка */}
            <div className="field">
              <label className="label">Торгова точка *</label>
              <div className="select is-fullwidth">
                <select
                  className={errors.tradePointId ? "is-danger" : ""}
                  value={tradePointId}
                  disabled={isViewOnly || !contractorId}
                  onChange={(e) => setTradePointId(e.target.value)}
                >
                  <option value="">— Оберіть —</option>
                  {filteredTradePoints.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name} {tp.address ? `(${tp.address})` : ""}
                    </option>
                  ))}
                </select>
                {errors.tradePointId && (
                  <p className="help is-danger">Оберіть торгову точку</p>
                )}
              </div>
            </div>

            {/* Причина */}
            <div className="field">
              <label className="label">Причина *</label>
              <textarea
                className={`textarea ${errors.reason ? "is-danger" : ""}`}
                rows="1"
                value={reason}
                disabled={isViewOnly}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            {errors.reason && (
              <p className="help is-danger">Вкажіть причину повернення</p>
            )}

            {/* Коментар */}
            <div className="field">
              <label className="label">Коментар</label>
              <textarea
                className="textarea"
                rows="1"
                value={comment}
                disabled={isViewOnly}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <div className={styles.lowerStack}>
              <div className={`field ${styles.executorPanel}`}>
                <label className="label">Виконавець</label>
                <div className={`buttons has-addons ${styles.executorButtons}`}>
                  <button
                    type="button"
                    className={`button ${styles.segmentButton} ${
                      executorType === "TA" ? styles.segmentActive : ""
                    }`}
                    disabled={isViewOnly}
                    onClick={() => setExecutorType("TA")}
                  >
                    ТА
                  </button>
                  <button
                    type="button"
                    className={`button ${styles.segmentButton} ${
                      executorType === "DRIVER" ? styles.segmentActive : ""
                    }`}
                    disabled={isViewOnly}
                    onClick={() => setExecutorType("DRIVER")}
                  >
                    Водій
                  </button>
                </div>
              </div>

              {/* Items */}
              <div className={styles.itemSection}>
                <div className={styles.sectionHeader}>
                  <h4 className="title is-6">Товари</h4>
                  {errors.items && (
                    <p className={styles.sectionMessage}>
                      Додайте хоча б одну позицію
                    </p>
                  )}
                  {!isViewOnly && (
                    <button
                      className={`button ${styles.addButton}`}
                      type="button"
                      onClick={openAddItem}
                    >
                      <i className="fa-solid fa-plus" aria-hidden="true"></i>{" "}
                      Додати позицію
                    </button>
                  )}
                </div>

            {items.length === 0 ? (
              <p className={styles.emptyItems}>Позиції ще не додані</p>
            ) : (
                <div className={styles.itemsTableScroll}>
                  <table className={`table ${styles.itemsTable}`}>
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Од.</th>
                    <th>К-ть</th>
                    <th>Вигот.</th>
                    <th>До</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, idx) => (
                    <tr key={idx}>
                      <td>
                        {
                          products.find(
                            (p) => String(p.id) === String(i.productId),
                          )?.name
                        }
                      </td>
                      <td>{getUnitLabel(i.unit)}</td>
                      <td>{i.quantity}</td>
                      <td>{i.manufactureDate}</td>
                      <td>{i.expiryDate}</td>
                      <td>
                        {!isViewOnly && <button
                          className={styles.itemActionButton}
                          type="button"
                          onClick={() => openEditItem(idx)}
                          aria-label="Редагувати позицію"
                        >
                          <i className="fa-solid fa-pencil"></i>
                        </button>}
                        {!isViewOnly && <button
                          className={`${styles.itemActionButton} ${styles.removeItemButton}`}
                          type="button"
                          onClick={() => removeItem(idx)}
                          aria-label="Видалити позицію"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                  </table>
                </div>
            )}
              </div>
            </div>
          </section>

          <footer className={`modal-card-foot ${styles.modalFooter}`}>
            {!isViewOnly && (
              <button
                className={`button ${styles.saveButton}`}
                type="button"
                onClick={handleSubmit}
                disabled={isSaveDisabled}
              >
                Зберегти
              </button>
            )}
            <button
              className={`button ${styles.cancelButton}`}
              type="button"
              onClick={onClose}
            >
              Скасувати
            </button>
          </footer>
        </div>
      </div>

      {/* Item Modal */}
      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSave={handleSaveItem}
        initialItem={editingIndex !== null ? items[editingIndex] : null}
        productGroups={productGroups}
        products={products}
        datesRequired
      />
    </>
  );
}
