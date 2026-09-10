import { useMemo, useState } from "react";
import FormInput from "../FormControl/FormInput.jsx";
import { previewBalanceWorkbook } from "../../services/config.api.js";
import styles from "./BalanceColumnConfigurator.module.scss";

function sameColumn(left, right) {
  return Number(left?.sourceIndex) === Number(right?.sourceIndex) &&
    String(left?.sourceHeader || "").trim().toLocaleLowerCase("uk") ===
      String(right?.sourceHeader || "").trim().toLocaleLowerCase("uk");
}

function getPreviewValue(row, column, config, priceMultiplierPercent) {
  const value = row.cells[column.id];
  if (column.id !== config?.priceColumnId || typeof value !== "number") {
    return value ?? "";
  }
  const multiplier = Number(priceMultiplierPercent);
  if (!Number.isFinite(multiplier) || multiplier < 0) return value;
  return value * (1 + multiplier / 100);
}

export function BalanceColumnConfigurator({ form, setForm, validationErrors = {} }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const config = form.columnConfig;
  const selectedColumns = config?.columns || [];

  const loadPreview = async () => {
    if (!form.fileName.trim()) {
      setError("Спочатку вкажіть назву XLSX-файлу");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const nextPreview = await previewBalanceWorkbook({
        fileName: form.fileName.trim(),
        headerRow: form.headerRow || null,
        dataStartRow: form.dataStartRow || null,
      });
      setPreview(nextPreview);

      const existingColumns = config?.columns || [];
      const mismatch = existingColumns.find((column) =>
        !nextPreview.headers.some((header) => sameColumn(header, column)));
      if (mismatch) {
        setError(
          `Структура змінилася: не знайдено колонку «${mismatch.sourceHeader}» ` +
          `на збереженій позиції. Виберіть колонки повторно`,
        );
      }

      const columns = existingColumns.length
        ? existingColumns.filter((column) =>
            nextPreview.headers.some((header) => sameColumn(header, column)))
        : nextPreview.headers.map((header, index) => ({
            id: header.id,
            sourceIndex: header.sourceIndex,
            sourceHeader: header.sourceHeader,
            title: header.sourceHeader,
            role: index === 0 ? "hierarchy" : "value",
          }));
      const hierarchyExists = columns.some((column) => column.role === "hierarchy");
      if (columns.length && !hierarchyExists) columns[0] = { ...columns[0], role: "hierarchy" };
      const selectedIds = new Set(columns.map((column) => column.id));
      const priceColumnId = selectedIds.has(config?.priceColumnId)
        ? config.priceColumnId
        : null;

      setForm((current) => ({
        ...current,
        headerRow: nextPreview.headerRow,
        dataStartRow: nextPreview.dataStartRow,
        columnConfig: columns.length
          ? { version: 1, columns, priceColumnId }
          : null,
      }));
    } catch (loadError) {
      setPreview(null);
      setError(loadError.response?.data?.error || loadError.response?.data?.message || loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = (columns, priceColumnId = config?.priceColumnId || null) => {
    const ids = new Set(columns.map((column) => column.id));
    const nextPriceColumnId = ids.has(priceColumnId) ? priceColumnId : null;
    setForm((current) => ({
      ...current,
      columnConfig: columns.length
        ? { version: 1, columns, priceColumnId: nextPriceColumnId }
        : null,
    }));
  };

  const toggleColumn = (header) => {
    const existingIndex = selectedColumns.findIndex((column) => sameColumn(column, header));
    if (existingIndex >= 0) {
      const next = selectedColumns.filter((_, index) => index !== existingIndex);
      if (selectedColumns[existingIndex].role === "hierarchy" && next.length) {
        next[0] = { ...next[0], role: "hierarchy" };
      }
      updateConfig(next);
      return;
    }
    updateConfig([
      ...selectedColumns,
      {
        id: header.id,
        sourceIndex: header.sourceIndex,
        sourceHeader: header.sourceHeader,
        title: header.sourceHeader,
        role: selectedColumns.length ? "value" : "hierarchy",
      },
    ]);
  };

  const updateColumn = (index, patch) => {
    updateConfig(selectedColumns.map((column, columnIndex) =>
      columnIndex === index ? { ...column, ...patch } : column));
  };

  const setHierarchyColumn = (index) => {
    updateConfig(selectedColumns.map((column, columnIndex) => ({
      ...column,
      role: columnIndex === index ? "hierarchy" : "value",
    })));
  };

  const moveColumn = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= selectedColumns.length) return;
    const next = [...selectedColumns];
    [next[index], next[target]] = [next[target], next[index]];
    updateConfig(next);
  };

  const previewColumns = useMemo(
    () => selectedColumns.filter((column) =>
      preview?.headers.some((header) => sameColumn(header, column))),
    [preview, selectedColumns],
  );

  return (
    <section className={styles.configurator}>
      <div className={styles.heading}>
        <div>
          <h4>Структура XLSX</h4>
          <p>Рядки рахуються від 1. Порожні значення вмикають сумісний автоматичний режим.</p>
        </div>
        <button type="button" className={styles.readButton} onClick={loadPreview} disabled={loading}>
          <i className="fa-solid fa-table" aria-hidden="true" />
          {loading ? "Зчитування…" : "Зчитати структуру"}
        </button>
      </div>

      <div className={styles.rowFields}>
        <label>Рядок заголовків
          <FormInput type="number" min="1" value={form.headerRow} onChange={(event) => {
            setPreview(null);
            setError("");
            setForm((current) => ({ ...current, headerRow: event.target.value, columnConfig: null }));
          }} />
        </label>
        <label>Перший рядок даних
          <FormInput type="number" min="1" value={form.dataStartRow} onChange={(event) => {
            setPreview(null);
            setError("");
            setForm((current) => ({ ...current, dataStartRow: event.target.value, columnConfig: null }));
          }} />
        </label>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {validationErrors.headerRow || validationErrors.dataStartRow || validationErrors.columnConfig ? (
        <div className={styles.error}>
          {validationErrors.headerRow || validationErrors.dataStartRow || validationErrors.columnConfig}
        </div>
      ) : null}

      {preview ? <>
        <div className={styles.availableColumns}>
          {preview.headers.map((header) => {
            const checked = selectedColumns.some((column) => sameColumn(column, header));
            return <label key={header.id}>
              <FormInput type="checkbox" checked={checked} onChange={() => toggleColumn(header)} />
              <span>{header.columnLetter}</span>{header.sourceHeader}
            </label>;
          })}
        </div>

        {selectedColumns.length ? <div className={styles.selectedColumns}>
          {selectedColumns.map((column, index) => (
            <div className={styles.columnRow} key={column.id}>
              <span className={styles.order}>{index + 1}</span>
              <span className={styles.source}>{column.sourceHeader}</span>
              <FormInput value={column.title} aria-label={`Заголовок ${column.sourceHeader}`}
                onChange={(event) => updateColumn(index, { title: event.target.value })} />
              <label className={styles.role}><input type="radio" name="balance-hierarchy-column"
                checked={column.role === "hierarchy"} onChange={() => setHierarchyColumn(index)} /> Ієрархія</label>
              <label className={styles.role}><input type="radio" name="balance-price-column"
                checked={config?.priceColumnId === column.id}
                onChange={() => updateConfig(selectedColumns, column.id)} /> Price</label>
              <div className={styles.orderButtons}>
                <button type="button" disabled={index === 0} onClick={() => moveColumn(index, -1)} aria-label="Перемістити вище"><i className="fa-solid fa-arrow-up" /></button>
                <button type="button" disabled={index === selectedColumns.length - 1} onClick={() => moveColumn(index, 1)} aria-label="Перемістити нижче"><i className="fa-solid fa-arrow-down" /></button>
              </div>
            </div>
          ))}
          <button type="button" className={styles.clearPrice} onClick={() => updateConfig(selectedColumns, null)}>
            Не застосовувати множник до колонок
          </button>
        </div> : null}

        {previewColumns.length ? <div className={styles.previewScroll}>
          <table><thead><tr>{previewColumns.map((column) => <th key={column.id}>{column.title}</th>)}</tr></thead>
            <tbody>{preview.previewRows.map((row) => <tr key={row.rowNumber}>{previewColumns.map((column) =>
              <td key={column.id}>{String(getPreviewValue(
                row,
                column,
                config,
                form.priceMultiplierPercent,
              ))}</td>)}</tr>)}</tbody></table>
        </div> : null}
      </> : null}

      {config ? <button type="button" className={styles.autoButton} onClick={() => setForm((current) => ({
        ...current, headerRow: "", dataStartRow: "", columnConfig: null,
      }))}>Повернути автоматичний режим</button> : null}
    </section>
  );
}
