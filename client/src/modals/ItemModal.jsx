import cn from "classnames";
import { useEffect, useMemo, useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import style from "./ItemModal.module.scss";

export default function ItemModal({
  isOpen,
  onClose,
  onSave,
  initialItem,
  productGroups,
  products,
}) {
  const [usePortalDatePicker, setUsePortalDatePicker] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [productId, setProductId] = useState("");
  const [unit, setUnit] = useState("PCS");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari =
      /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);

    setUsePortalDatePicker(isIOS && isSafari);
  }, []);

  /* ---------- init ---------- */
  useEffect(() => {
    if (initialItem) {

      // Пытаемся найти товар по productId или product названию
      let foundProduct = null;
      if (initialItem.productId) {
        foundProduct = products?.find(
          (p) =>
            p.id === initialItem.productId ||
            String(p.id) === String(initialItem.productId),
        );
      } else if (initialItem.product) {
        // Ищем по названию товара
        foundProduct = products?.find((p) => p.name === initialItem.product);
      }


      // Если нашли товар, берем его группу
      const gid = foundProduct
        ? (foundProduct.group_id ?? foundProduct.groupId)
        : initialItem.groupId || "";

      setGroupId(gid?.toString() || "");
      setProductId(
        foundProduct ? foundProduct.id.toString() : initialItem.productId || "",
      );
      setUnit(initialItem.unit || "PCS");
      setQuantity(initialItem.quantity || "");
      setManufactureDate(initialItem.manufactureDate || "");
      setExpiryDate(initialItem.expiryDate || "");
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

  /* ---------- products by group ---------- */
  const productsByGroup = useMemo(() => {
    const map = {};
    for (const p of products || []) {
      const gid = String(p.group_id ?? p.groupId);
      if (!map[gid]) map[gid] = [];
      map[gid].push(p);
    }
    return map;
  }, [products]);

  /* ---------- validation ---------- */
  function validate() {
    const e = {};
    if (!groupId) e.groupId = true;
    if (!productId) e.productId = true;
    if (!quantity) e.quantity = true;
    if (!manufactureDate) e.manufactureDate = true;
    if (!expiryDate) e.expiryDate = true;
    setErrors(e);

    return Object.keys(e).length === 0;
  }

  function parseIsoDate(value) {
    if (!value) return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
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
          {/* Группа */}
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
                {productGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Товар */}
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
                {(productsByGroup[String(groupId)] || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Unit + Qty */}
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

          {/* Dates */}
          <div className="columns">
            <div className="column">
              <label className="label">Дата виготовлення *</label>
              {/* <input
                className={`input ${errors.manufactureDate ? "is-danger" : ""}`}
                type="date"
                value={manufactureDate}
                onChange={(e) => setManufactureDate(e.target.value)}
              /> */}
              <DatePicker
                className={cn(style.dateInput, {
                  [style.dateInputError]: errors.manufactureDate,
                })}
                locale="uk"
                dateFormat="dd.MM.yyyy"
                selected={parseIsoDate(manufactureDate)}
                inputMode="none"
                withPortal={usePortalDatePicker}
                popperPlacement="bottom-start"
                popperClassName={style.datePickerPopper}
                calendarClassName={style.datePickerCalendar}
                popperModifiers={[
                  {
                    name: "preventOverflow",
                    options: { boundary: "viewport", padding: 8 },
                  },
                  { name: "offset", options: { offset: [0, 8] } },
                ]}
                shouldCloseOnSelect
                onFocus={(e) => {
                  if (usePortalDatePicker) e.target.blur();
                }}
                onChange={(date) => {
                  if (!date) return;
                  setManufactureDate(date.toISOString().split("T")[0]);
                  setErrors((prev) => ({ ...prev, manufactureDate: false }));
                }}
              ></DatePicker>
            </div>

            <div className="column">
              <label className="label">Придатний до *</label>
              {/* <input
                className={`input ${errors.expiryDate ? "is-danger" : ""}`}
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                /> */}
              <DatePicker
                className={cn(style.dateInput, {
                  [style.dateInputError]: errors.expiryDate,
                })}
                locale="uk"
                dateFormat="dd.MM.yyyy"
                selected={parseIsoDate(expiryDate)}
                inputMode="none"
                withPortal={usePortalDatePicker}
                popperPlacement="bottom-start"
                popperClassName={style.datePickerPopper}
                calendarClassName={style.datePickerCalendar}
                popperModifiers={[
                  {
                    name: "preventOverflow",
                    options: { boundary: "viewport", padding: 8 },
                  },
                  { name: "offset", options: { offset: [0, 8] } },
                ]}
                shouldCloseOnSelect
                onFocus={(e) => {
                  if (usePortalDatePicker) e.target.blur();
                }}
                onChange={(date) => {
                  if (!date) return;
                  setExpiryDate(date.toISOString().split("T")[0]);
                  setErrors((prev) => ({ ...prev, expiryDate: false }));
                }}
              ></DatePicker>
            </div>
          </div>
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
