import { useEffect, useMemo, useState } from "react";
import FormInput from "../components/FormControl/FormInput.jsx";
import DateInput from "../components/DateInput/DateInput.jsx";
import CompactSelect from "../components/CompactSelect/CompactSelect.jsx";
import style from "./ItemModal.module.scss";

export default function ItemModal({
  isOpen,
  onClose,
  onSave,
  initialItem,
  productGroups,
  products,
  datesRequired = true,
}) {
  const [groupId, setGroupId] = useState("");
  const [productId, setProductId] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialItem) {
      let foundProduct = null;

      if (initialItem.productId) {
        foundProduct = products?.find(
          (p) =>
            p.id === initialItem.productId ||
            String(p.id) === String(initialItem.productId),
        );
      } else if (initialItem.product) {
        foundProduct = products?.find((p) => p.name === initialItem.product);
      }

      const resolvedGroupId = foundProduct
        ? (foundProduct.group_id ?? foundProduct.groupId)
        : initialItem.groupId || "";

      setGroupId(resolvedGroupId?.toString() || "");
      setProductId(
        foundProduct ? foundProduct.id.toString() : initialItem.productId || "",
      );
      setUnit(initialItem.unit || "PCS");
      setQuantity(initialItem.quantity || "");
      setManufactureDate(initialItem.manufactureDate || "");
      setExpiryDate(initialItem.expiryDate || "");
      setErrors({});
    } else {
      reset();
    }
  }, [initialItem, isOpen, products]);

  function reset() {
    setGroupId("");
    setProductId("");
    setUnit("PCS");
    setQuantity("");
    setManufactureDate("");
    setExpiryDate("");
    setErrors({});
  }

  const productsByGroup = useMemo(() => {
    const map = {};

    for (const product of products || []) {
      const currentGroupId = String(product.group_id ?? product.groupId);
      if (!map[currentGroupId]) {
        map[currentGroupId] = [];
      }
      map[currentGroupId].push(product);
    }

    return map;
  }, [products]);

  function validate() {
    const nextErrors = {};

    if (!groupId) nextErrors.groupId = true;
    if (!productId) nextErrors.productId = true;
    if (!quantity) nextErrors.quantity = true;
    if (datesRequired && !manufactureDate) nextErrors.manufactureDate = true;
    if (datesRequired && !expiryDate) nextErrors.expiryDate = true;
    if (manufactureDate && expiryDate && manufactureDate > expiryDate) {
      nextErrors.mismathDate = true;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSave() {
    if (!validate()) return;

    onSave({
      groupId,
      productId,
      unit,
      quantity,
      manufactureDate,
      expiryDate,
    });

    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className={`modal is-active ${style.itemModal}`}
    >
      <div
        className={`modal-background ${style.modalBackdrop}`}
        onClick={onClose}
      />

      <div className={`modal-card ${style.itemModalCard}`}>
        <header className={`modal-card-head ${style.modalHeader}`}>
          <p className={`modal-card-title ${style.modalTitle}`}>
            {initialItem ? "Редагування позиції" : "Нова позиція"}
          </p>
          <button
            className={`delete ${style.closeButton}`}
            type="button"
            onClick={onClose}
            aria-label="Закрити"
          />
        </header>

        <section className={`modal-card-body ${style.itemModalBody}`}>
          <div className="field">
            <label className="label">Група *</label>
            <CompactSelect
              value={groupId}
              options={productGroups.map((group) => ({
                value: group.id,
                label: group.name,
              }))}
              hasError={Boolean(errors.groupId)}
              ariaLabel="Група"
              onChange={(nextGroupId) => {
                setGroupId(nextGroupId);
                setProductId("");
                setErrors((prev) => ({ ...prev, groupId: false }));
              }}
            />
          </div>

          <div className="field">
            <label className="label">Товар *</label>
            <CompactSelect
              value={productId}
              options={(productsByGroup[String(groupId)] || []).map(
                (product) => ({
                  value: product.id,
                  label: product.name,
                }),
              )}
              disabled={!groupId}
              hasError={Boolean(errors.productId)}
              ariaLabel="Товар"
              onChange={(nextProductId) => {
                setProductId(nextProductId);
                setErrors((prev) => ({ ...prev, productId: false }));
              }}
            />
          </div>

          <div className={`columns ${style.compactColumns}`}>
            <div className="column is-4">
              <label className="label">Одиниця</label>
              <CompactSelect
                value={unit}
                options={[
                  { value: "PCS", label: "шт" },
                  { value: "KG", label: "кг" },
                  { value: "BOX", label: "ящ" },
                  { value: "BLOCK", label: "блок" },
                ]}
                ariaLabel="Одиниця"
                onChange={setUnit}
              />
            </div>

            <div className="column">
              <label className="label">Кількість *</label>
              <FormInput
                className={`input ${errors.quantity ? "is-danger" : ""}`}
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setErrors((prev) => ({ ...prev, quantity: false }));
                }}
              />
            </div>
          </div>

          <div className={`columns ${style.compactColumns} ${style.dateColumns}`}>
            <div className="column">
              <label className="label">
                Дата виготовлення{datesRequired ? " *" : ""}
              </label>
              <DateInput
                className={style.dateInput}
                hasError={Boolean(errors.manufactureDate)}
                value={manufactureDate}
                onChange={(event) => {
                  setManufactureDate(event.target.value);
                  setErrors((prev) => ({ ...prev, manufactureDate: false }));
                }}
              />
            </div>

            <div className="column">
              <label className="label">
                Придатний до{datesRequired ? " *" : ""}
              </label>
              <DateInput
                className={style.dateInput}
                hasError={Boolean(errors.expiryDate)}
                value={expiryDate}
                onChange={(event) => {
                  setExpiryDate(event.target.value);
                  setErrors((prev) => ({ ...prev, expiryDate: false }));
                }}
              />
            </div>
          </div>

          {errors.mismathDate && (
            <p className={style.dateErrorMessage}>
              Дата виготовлення не може бути пізніше дати придатності
            </p>
          )}
        </section>

        <footer className={`modal-card-foot ${style.itemModalFooter}`}>
          <button
            className={`button ${style.saveButton}`}
            type="button"
            onClick={handleSave}
          >
            Зберегти
          </button>
          <button
            className={`button ${style.cancelButton}`}
            type="button"
            onClick={onClose}
          >
            Скасувати
          </button>
        </footer>
      </div>
    </div>
  );
}
