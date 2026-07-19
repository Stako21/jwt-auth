import { useCallback, useEffect, useMemo, useState } from "react";
import { enqueueSnackbar } from "notistack";
import {
  fetchWarehouseSettings,
  previewWarehouseRate,
  saveWarehouseRate,
} from "../../services/config.api";
import { DataLoader } from "../DataLoader/DataLoader";

function todayKey() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatRate(value) {
  if (value === null || typeof value === "undefined") return "—";
  return Number(value).toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function createForm(warehouse) {
  return {
    effectiveFrom: todayKey(),
    rowRate: warehouse.rowRate ?? "",
    kilogramRate: warehouse.kilogramRate ?? "",
  };
}

export function WarehouseSettings() {
  const [warehouses, setWarehouses] = useState([]);
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchWarehouseSettings();
      setWarehouses(rows);
      setForms((current) =>
        Object.fromEntries(
          rows.map((warehouse) => [
            warehouse.id,
            current[warehouse.id] || createForm(warehouse),
          ]),
        ),
      );
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося завантажити склади",
        { variant: "error" },
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const missingRates = useMemo(
    () =>
      warehouses.filter(
        (warehouse) =>
          warehouse.rowRate === null || warehouse.kilogramRate === null,
      ).length,
    [warehouses],
  );

  const updateForm = (warehouseId, field, value) => {
    setForms((current) => ({
      ...current,
      [warehouseId]: { ...current[warehouseId], [field]: value },
    }));
  };

  const persist = async (warehouse, payload, confirmHistoricalChange) => {
    setSavingId(warehouse.id);
    try {
      await saveWarehouseRate(warehouse.id, {
        ...payload,
        confirmHistoricalChange,
      });
      enqueueSnackbar("Ставку збережено", { variant: "success" });
      setConfirmation(null);
      await load();
    } catch (error) {
      const data = error.response?.data;
      if (data?.confirmationRequired) {
        setConfirmation({ warehouse, payload, impact: data.impact });
      } else {
        enqueueSnackbar(data?.error || "Не вдалося зберегти ставку", {
          variant: "error",
        });
      }
    } finally {
      setSavingId(null);
    }
  };

  const submit = async (warehouse) => {
    const form = forms[warehouse.id];
    const payload = {
      effectiveFrom: form.effectiveFrom,
      rowRate: Number(form.rowRate),
      kilogramRate: Number(form.kilogramRate),
    };
    if (
      !form.effectiveFrom ||
      form.rowRate === "" ||
      form.kilogramRate === "" ||
      payload.rowRate < 0 ||
      payload.kilogramRate < 0
    ) {
      enqueueSnackbar("Заповніть дату та невід'ємні ставки", {
        variant: "warning",
      });
      return;
    }

    setSavingId(warehouse.id);
    try {
      const impact = await previewWarehouseRate(warehouse.id, payload);
      if (impact.confirmationRequired) {
        setConfirmation({ warehouse, payload, impact });
      } else {
        await persist(warehouse, payload, false);
      }
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.error || "Не вдалося перевірити зміну ставки",
        { variant: "error" },
      );
    } finally {
      setSavingId(null);
    }
  };

  if (loading && warehouses.length === 0) {
    return <DataLoader label="Завантаження складів і ставок…" fullPage />;
  }

  return (
    <section className="section pt-4 px-2">
      <div className="container">
        <h1 className="title is-4 has-text-white">Налаштування складів</h1>
        <p className="subtitle is-6 has-text-grey-light">
          Склади створюються автоматично з файлу зібраних накладних.
          {missingRates > 0
            ? ` Потрібно налаштувати ставок: ${missingRates}.`
            : " Усі поточні ставки налаштовані."}
        </p>

        {warehouses.length === 0 ? (
          <div className="notification is-info is-light">
            Склади ще не імпортовано.
          </div>
        ) : null}

        {warehouses.map((warehouse) => {
          const form = forms[warehouse.id] || createForm(warehouse);
          return (
            <article className="box mb-4" key={warehouse.id}>
              <div className="is-flex is-justify-content-space-between is-flex-wrap-wrap mb-3">
                <div>
                  <h2 className="title is-5 mb-1">{warehouse.warehouseName}</h2>
                  <code>{warehouse.warehouseGuid}</code>
                </div>
                <div className="has-text-right">
                  <div>Рядок: <strong>{formatRate(warehouse.rowRate)}</strong></div>
                  <div>Кілограм: <strong>{formatRate(warehouse.kilogramRate)}</strong></div>
                  <small>діє з {warehouse.effectiveFrom || "—"}</small>
                </div>
              </div>

              <div className="columns is-variable is-2 is-multiline is-align-items-flex-end">
                <div className="column is-12-mobile is-4-tablet">
                  <label className="label">Дата початку дії</label>
                  <input
                    className="input"
                    type="date"
                    value={form.effectiveFrom}
                    onChange={(event) =>
                      updateForm(warehouse.id, "effectiveFrom", event.target.value)
                    }
                  />
                </div>
                <div className="column is-6-mobile is-3-tablet">
                  <label className="label">Вартість рядка</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.rowRate}
                    onChange={(event) =>
                      updateForm(warehouse.id, "rowRate", event.target.value)
                    }
                  />
                </div>
                <div className="column is-6-mobile is-3-tablet">
                  <label className="label">Вартість кілограма</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.kilogramRate}
                    onChange={(event) =>
                      updateForm(warehouse.id, "kilogramRate", event.target.value)
                    }
                  />
                </div>
                <div className="column is-12-mobile is-2-tablet">
                  <button
                    type="button"
                    className={`button is-primary is-fullwidth ${savingId === warehouse.id ? "is-loading" : ""}`}
                    onClick={() => submit(warehouse)}
                    disabled={savingId !== null}
                  >
                    Зберегти
                  </button>
                </div>
              </div>

              {warehouse.rates?.length ? (
                <details>
                  <summary>Історія ставок ({warehouse.rates.length})</summary>
                  <div className="table-container mt-2">
                    <table className="table is-fullwidth is-striped is-narrow">
                      <thead><tr><th>Діє з</th><th>Рядок</th><th>Кілограм</th><th>Змінив</th></tr></thead>
                      <tbody>
                        {warehouse.rates.map((rate) => (
                          <tr key={rate.id}>
                            <td>{rate.effectiveFrom}</td>
                            <td>{formatRate(rate.rowRate)}</td>
                            <td>{formatRate(rate.kilogramRate)}</td>
                            <td>{rate.createdByName || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>

      {confirmation ? (
        <div className="modal is-active">
          <div className="modal-background" />
          <div className="modal-card">
            <header className="modal-card-head">
              <p className="modal-card-title">Підтвердження зміни ставки</p>
            </header>
            <section className="modal-card-body">
              <div className="notification is-warning">
                <strong>Увага!</strong> Ви змінюєте ставку за вже розрахований
                період. Заробіток комплектувальників буде перераховано.
              </div>
              <p><strong>Склад:</strong> {confirmation.warehouse.warehouseName}</p>
              <p><strong>Період:</strong> {confirmation.impact.affectedDateFrom} — {confirmation.impact.affectedDateTo}</p>
              <p><strong>Рядків звіту:</strong> {confirmation.impact.affectedRowsCount}</p>
              <p><strong>Комплектувальників:</strong> {confirmation.impact.affectedPickersCount}</p>
            </section>
            <footer className="modal-card-foot">
              <button
                className={`button is-danger ${savingId ? "is-loading" : ""}`}
                onClick={() => persist(
                  confirmation.warehouse,
                  confirmation.payload,
                  true,
                )}
              >
                Підтвердити перерахунок
              </button>
              <button className="button" onClick={() => setConfirmation(null)}>
                Скасувати
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
