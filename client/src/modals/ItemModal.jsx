import cn from "classnames";
import DatePicker from "react-datepicker";
import { forwardRef, useEffect, useMemo, useState } from "react";
import style from "./ItemModal.module.scss";

const CustomInput = forwardRef(function CustomInput(
  { value, onClick, hasError },
  ref,
) {
  return (
    <input
      ref={ref}
      value={value}
      onClick={onClick}
      className={cn("input", {
        [style.dateInput]: true,
        [style.dateInputError]: hasError,
      })}
      readOnly
    />
  );
});

function toPickerDate(value) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

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
      className="modal is-active"
      style={{ "--bulma-modal-card-head-padding": "10px 32px" }}
    >
      <div className="modal-background" onClick={onClose} />

      <div className="modal-card" style={{ maxWidth: 600 }}>
        <header className="modal-card-head">
          <p className="modal-card-title">
            {initialItem ? "Редагування позиції" : "Нова позиція"}
          </p>
          <button className="delete" onClick={onClose} />
        </header>

        <section className="modal-card-body">
          <div className="field">
            <label className="label">Група *</label>
            <div
              className={cn("select is-fullwidth", {
                "is-danger": errors.groupId,
              })}
            >
              <select
                className={errors.groupId ? "is-danger" : ""}
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setProductId("");
                  setErrors((prev) => ({ ...prev, groupId: false }));
                }}
              >
                <option value="">— Оберіть —</option>
                {productGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label">Товар *</label>
            <div
              className={cn("select is-fullwidth", {
                "is-danger": errors.productId,
              })}
            >
              <select
                value={productId}
                disabled={!groupId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setErrors((prev) => ({ ...prev, productId: false }));
                }}
              >
                <option value="">— Оберіть —</option>
                {(productsByGroup[String(groupId)] || []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="columns">
            <div className="column is-4">
              <label className="label">Одиниця</label>
              <div className="select is-fullwidth">
                <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  <option value="PCS">шт</option>
                  <option value="KG">кг</option>
                  <option value="BOX">ящ</option>
                  <option value="BLOCK">блок</option>
                </select>
              </div>
            </div>

            <div className="column">
              <label className="label">Кількість *</label>
              <input
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

          <div className={`columns ${style.dateColumns}`}>
            <div className="column">
              <label className="label">
                Дата виготовлення{datesRequired ? " *" : ""}
              </label>
              <DatePicker
                popperClassName={style.datepickerPopper}
                className={cn(style.dateInput, {
                  [style.dateInputError]: errors.manufactureDate,
                })}
                locale="uk"
                dateFormat="dd.MM.yyyy"
                customInput={
                  <CustomInput hasError={Boolean(errors.manufactureDate)} />
                }
                isClearable={!datesRequired}
                selected={toPickerDate(manufactureDate)}
                onChange={(date) => {
                  setManufactureDate(date ? date.toISOString().split("T")[0] : "");
                  setErrors((prev) => ({ ...prev, manufactureDate: false }));
                }}
              />
            </div>

            <div className="column">
              <label className="label">
                Придатний до{datesRequired ? " *" : ""}
              </label>
              <DatePicker
                popperClassName={style.datepickerPopper}
                className={cn(style.dateInput, {
                  [style.dateInputError]: errors.expiryDate,
                })}
                locale="uk"
                dateFormat="dd.MM.yyyy"
                customInput={<CustomInput hasError={Boolean(errors.expiryDate)} />}
                isClearable={!datesRequired}
                selected={toPickerDate(expiryDate)}
                onChange={(date) => {
                  setExpiryDate(date ? date.toISOString().split("T")[0] : "");
                  setErrors((prev) => ({ ...prev, expiryDate: false }));
                }}
              />
            </div>
          </div>

          {errors.mismathDate && (
            <p className="help is-danger">
              Дата виготовлення не може бути пізніше дати придатності
            </p>
          )}
        </section>

        <footer
          className="modal-card-foot"
          style={{ justifyContent: "center", gap: "20px" }}
        >
          <button className="button is-primary" onClick={handleSave}>
            Зберегти
          </button>
          <button className="button is-danger" onClick={onClose}>
            Скасувати
          </button>
        </footer>
      </div>
    </div>
  );
}
