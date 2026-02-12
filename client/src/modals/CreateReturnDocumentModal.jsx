import { useMemo, useState, useEffect } from "react";
import { createDocument } from "../services/documents.api";
import ItemModal from "./ItemModal";

export default function CreateReturnDocumentModal({
  isOpen,
  onClose,
  onCreated,
  contractors,
  tradePoints,
  productGroups,
  products,
}) {
  /* ---------------- state ---------------- */
  const [contractorId, setContractorId] = useState("");
  const [tradePointId, setTradePointId] = useState("");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");

  const [contractorSearch, setContractorSearch] = useState("");
  const [showContractorDropdown, setShowContractorDropdown] = useState(false);

  const [items, setItems] = useState([]);

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [errors, setErrors] = useState({});

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

  console.log("errors: ", errors);

  function validateDocument() {
    const e = {};

    if (!contractorId) e.contractorId = true;
    if (!tradePointId) e.tradePointId = true;
    if (!reason.trim()) e.reason = true;
    if (items.length === 0) e.items = true;

    console.log("validateDocument: ", e);

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ---------------- helpers ---------------- */
  function reset() {
    setContractorId("");
    setTradePointId("");
    setReason("");
    setComment("");
    setItems([]);
  }

  /* ---------------- filters ---------------- */
  const filteredTradePoints = useMemo(() => {
    if (!contractorId) return [];
    return tradePoints.filter(
      (tp) => tp.contractor_id === Number(contractorId),
    );
  }, [contractorId, tradePoints]);

  const filteredContractors = useMemo(() => {
    if (!contractorSearch.trim()) return [];
    return contractors.filter((c) =>
      c.name.toLowerCase().includes(contractorSearch.toLowerCase()),
    );
  }, [contractorSearch, contractors]);

  /* ---------------- item modal ---------------- */
  function openAddItem() {
    setEditingIndex(null);
    setIsItemModalOpen(true);
  }

  function openEditItem(index) {
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
    setItems(items.filter((_, i) => i !== index));
  }

  /* ---------------- submit ---------------- */
  async function handleSubmit() {
    console.log("handleSubmit - я сработала!!!");

    if (!validateDocument()) return;

    try {
      await createDocument({
        documentType: "RETURN",
        documentDate: new Date().toISOString().slice(0, 10),
        tradePointId: Number(tradePointId),
        reason,
        comment,
        items: items.map((i) => ({
          productId: Number(i.productId),
          unit: i.unit,
          quantity: Number(i.quantity),
          manufactureDate: i.manufactureDate,
          expiryDate: i.expiryDate,
          operation: "TAKE",
        })),
      });

      onCreated();
      reset();
      onClose();
    } catch (e) {
      console.error(e);
    }
  }

  const isSaveDisabled =
    !contractorId || !tradePointId || !reason.trim() || items.length === 0;

  if (!isOpen) return null;

  /* ---------------- render ---------------- */
  return (
    <>
      <div
        className="modal is-active"
        style={{ "--bulma-modal-card-head-padding": "10px 32px" }}
      >
        <div className="modal-background" onClick={onClose} />

        <div className="modal-card" style={{ width: "95%" }}>
          <header className="modal-card-head">
            <p className="modal-card-title">Новий документ — Повернення</p>
            <button className="delete" onClick={onClose} />
          </header>

          <section className="modal-card-body">
            {/* Контрагент */}
            <div className="field">
              <label className="label">Контрагент</label>
              <div className="control" style={{ position: "relative" }}>
                <input
                  className={`input ${errors.contractorId ? "is-danger" : ""}`}
                  placeholder="Почніть вводити назву"
                  value={contractorSearch}
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
                  <div className="dropdown-content">
                    {filteredContractors.map((c) => (
                      <div
                        key={c.id}
                        className="dropdown-item"
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
                  disabled={!contractorId}
                  onChange={(e) => setTradePointId(e.target.value)}
                >
                  <option value="">— Оберіть —</option>
                  {filteredTradePoints.map((tp) => (
                    <option key={tp.id} value={tp.id}>
                      {tp.name}
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
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            <hr />

            {/* Items */}
            <div className="is-flex is-justify-content-space-between mb-2">
              <h4 className="title is-6">Товари</h4>
              {errors.items && (
                <p className="help is-danger mb-2">
                  Додайте хоча б одну позицію
                </p>
              )}
              <button className="button is-link is-light" onClick={openAddItem}>
                ➕ Додати позицію
              </button>
            </div>

            {items.length === 0 ? (
              <p className="has-text-grey is-size-7">Позиції ще не додані</p>
            ) : (
              <table className="table is-fullwidth is-bordered is-size-7">
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
                      <td>{i.unit}</td>
                      <td>{i.quantity}</td>
                      <td>{i.manufactureDate}</td>
                      <td>{i.expiryDate}</td>
                      <td>
                        <button
                          className="button is-small is-light"
                          onClick={() => openEditItem(idx)}
                        >
                          ✏️
                        </button>
                        <button
                          className="button is-small is-danger ml-1"
                          onClick={() => removeItem(idx)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <footer
            className="modal-card-foot"
            style={{ justifyContent: "center", gap: "20px" }}
          >
            <button
              className="button is-primary"
              onClick={handleSubmit}
              disabled={isSaveDisabled}
            >
              Зберегти
            </button>
            <button className="button is-danger" onClick={onClose}>
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
      />
    </>
  );
}
