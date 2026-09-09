import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  showUnit = true,
  showDates = true,
  productLabel = "Товар",
  productPlaceholder = "Почніть вводити назву товару",
}) {
  const [groupId, setGroupId] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProducts, setShowProducts] = useState(false);
  const [unit, setUnit] = useState("PCS");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [errors, setErrors] = useState({});
  const productInputRef = useRef(null);

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
      setProductSearch(foundProduct?.name || initialItem.product || "");
      setShowProducts(false);
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
    setProductSearch("");
    setShowProducts(false);
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

  const groupNames = useMemo(
    () => new Map(
      (productGroups || []).map((group) => [String(group.id), group.name]),
    ),
    [productGroups],
  );

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("uk");
    const source = groupId
      ? productsByGroup[String(groupId)] || []
      : products || [];

    return source.filter((product) =>
      !query || String(product.name || "").toLocaleLowerCase("uk").includes(query),
    );
  }, [groupId, productSearch, products, productsByGroup]);

  function selectProduct(product) {
    const nextGroupId = String(product.group_id ?? product.groupId ?? "");
    setProductId(String(product.id));
    setProductSearch(product.name || "");
    setGroupId(nextGroupId);
    setShowProducts(false);
    setErrors((prev) => ({ ...prev, groupId: false, productId: false }));
    productInputRef.current?.blur();
  }

  function validate() {
    const nextErrors = {};

    if (!groupId) nextErrors.groupId = true;
    if (!productId) nextErrors.productId = true;
    if (!quantity || Number(quantity) <= 0) nextErrors.quantity = true;
    if (showDates && datesRequired && !manufactureDate) nextErrors.manufactureDate = true;
    if (showDates && datesRequired && !expiryDate) nextErrors.expiryDate = true;
    if (showDates && manufactureDate && expiryDate && manufactureDate > expiryDate) {
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

  return createPortal(
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
                const selectedProduct = (products || []).find(
                  (product) => String(product.id) === String(productId),
                );
                const selectedProductGroupId = String(
                  selectedProduct?.group_id ?? selectedProduct?.groupId ?? "",
                );
                setGroupId(nextGroupId);
                if (selectedProduct && selectedProductGroupId !== String(nextGroupId)) {
                  setProductId("");
                  setProductSearch("");
                }
                setErrors((prev) => ({ ...prev, groupId: false }));
              }}
            />
          </div>

          <div className="field">
            <label className="label">{productLabel} *</label>
            <div
              className={style.productPicker}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setShowProducts(false);
                }
              }}
            >
              <FormInput
                ref={productInputRef}
                className={errors.productId ? "is-danger" : ""}
                value={productSearch}
                placeholder={productPlaceholder}
                aria-label={productLabel}
                role="combobox"
                aria-expanded={showProducts}
                aria-haspopup="listbox"
                autoComplete="off"
                onFocus={() => setShowProducts(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setShowProducts(false);
                  if (event.key === "ArrowDown") setShowProducts(true);
                }}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductId("");
                  setShowProducts(true);
                  setErrors((prev) => ({ ...prev, productId: false }));
                }}
              />
              {showProducts ? (
                <div className={style.productOptions} role="listbox">
                  {filteredProducts.length ? filteredProducts.map((product) => {
                    const productGroupId = String(product.group_id ?? product.groupId ?? "");
                    return (
                      <button
                        key={product.id}
                        className={style.productOption}
                        type="button"
                        role="option"
                        aria-selected={String(product.id) === String(productId)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectProduct(product)}
                      >
                        <span>{product.name}</span>
                        <small>{groupNames.get(productGroupId) || "Без групи"}</small>
                      </button>
                    );
                  }) : (
                    <p className={style.emptyProducts}>{productLabel} не знайдено</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className={showUnit ? `columns ${style.compactColumns}` : "field"}>
            {showUnit ? <div className="column is-4">
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
            </div> : null}

            <div className={showUnit ? "column" : undefined}>
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

          {showDates ? <div className={`columns ${style.compactColumns} ${style.dateColumns}`}>
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
          </div> : null}

          {showDates && errors.mismathDate && (
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
    </div>,
    document.body,
  );
}
