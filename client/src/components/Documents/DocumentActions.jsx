import { useEffect, useRef, useState } from "react";
import FormInput from "../FormControl/FormInput.jsx";
import CompactSelect from "../CompactSelect/CompactSelect.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { getOneCStageLabel } from "./oneCStage.js";
import { executeAdminDocumentActions, fetchAdminDocuments } from "../../services/documents.api.js";
import styles from "./DocumentActions.module.scss";

const ACTIONS = { cancel: "Скасувати", revision: "На доопрацювання", sync: "Реєстрація на синхронізацію", unsync: "Зняти з реєстрації" };
const VIEWS = [
  { value: "all", label: "Усі документи" },
  { value: "sync-pending", label: "Зареєстровані на синхронізацію" },
];
const STATUSES = [
  ["", "Усі статуси"], ["NEW", "Новий"], ["REVISION", "На доопрацювання"],
  ["NOT_COMPLETED", "Не виконано"], ["PLANNED", "Заплановано"],
  ["COMPLETED", "Виконано"], ["CANCELLED", "Скасовано"], ["REJECTED", "Відхилено"],
].map(([value, label]) => ({ value, label }));

function initialFilters() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => today.find((item) => item.type === type).value;
  const month = `${part("year")}-${part("month")}`;
  return { dateFrom: `${month}-01`, dateTo: `${month}-${new Date(Number(part("year")), Number(part("month")), 0).getDate()}`, search: "", status: "" };
}

function displayDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
}

export function DocumentActions() {
  const [filters, setFilters] = useState(initialFilters);
  const [query, setQuery] = useState(() => ({ ...initialFilters(), page: 1, view: "all" }));
  const [reload, setReload] = useState(0);
  const [data, setData] = useState({ data: [], total: 0, pageSize: 1000 });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [comment, setComment] = useState("");
  const [report, setReport] = useState(null);
  const dialogRef = useRef(null);
  const isSyncView = query.view === "sync-pending";
  const selectableRows = data.data.filter((row) => !isSyncView || row.status_sync_requested_at);
  const availableActions = isSyncView ? ["unsync"] : ["cancel", "revision", "sync"];

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setSelected(new Set());
    setError("");
    fetchAdminDocuments(query, controller.signal).then((response) => {
      if (active) {
        const lastPage = Math.max(1, Math.ceil(response.total / response.pageSize));
        if (query.page > lastPage) setQuery((current) => ({ ...current, page: lastPage }));
        else setData(response);
      }
    }).catch((requestError) => {
      if (active) {
        setData({ data: [], total: 0, pageSize: 1000 });
        setError(requestError?.response?.data?.message || "Не вдалося завантажити документи");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [query, reload]);

  useEffect(() => {
    if (!confirmation) return undefined;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, [confirmation]);

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectPage = () => setSelected(new Set(selectableRows.map((row) => row.id)));
  const openAction = (action) => {
    setComment("");
    setError("");
    setConfirmation({ action, documents: data.data.filter((row) => selected.has(row.id)) });
  };
  const execute = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await executeAdminDocumentActions({
        action: confirmation.action, comment,
        documents: confirmation.documents.map((row) => ({
          id: row.id, expectedStatus: row.status,
          ...(confirmation.action === "unsync" ? { expectedSyncRequestedAt: row.status_sync_requested_at } : {}),
        })),
      });
      const names = new Map(confirmation.documents.map((row) => [row.id, row.document_number]));
      setReport({ ...response, action: confirmation.action,
        results: response.results.map((item) => ({ ...item, number: names.get(item.id) })) });
      setConfirmation(null);
      setSelected(new Set());
      setReload((value) => value + 1);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Не вдалося виконати дію. Оновіть список і перевірте результат перед повтором.");
    } finally { setBusy(false); }
  };
  const changeFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const applyFilters = (event) => {
    event.preventDefault();
    setReport(null);
    setQuery((current) => ({ ...filters, page: 1, view: current.view }));
  };
  const changeView = (view) => {
    if (view === query.view || busy) return;
    const nextFilters = view === "sync-pending"
      ? { dateFrom: "", dateTo: "", status: "", search: "" }
      : initialFilters();
    setFilters(nextFilters);
    setSelected(new Set());
    setReport(null);
    setLoading(true);
    setQuery({ ...nextFilters, page: 1, view });
  };
  const navigateTabs = (event, index) => {
    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") nextIndex = 1 - index;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = VIEWS.length - 1;
    else return;
    event.preventDefault();
    changeView(VIEWS[nextIndex].value);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex].focus();
  };
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));

  return <section className={styles.workspace}>
    <header className={styles.header}>
      <div><h2>Дії з документами</h2><p>Групові адміністративні дії із заявками ТРО.</p></div>
      <button type="button" disabled={loading || busy} onClick={() => setReload((value) => value + 1)}>Оновити</button>
    </header>
    <div className={styles.tabs} role="tablist" aria-label="Списки документів">
      {VIEWS.map((view, index) => <button key={view.value} id={`document-actions-tab-${view.value}`} type="button" role="tab"
        aria-selected={query.view === view.value} aria-controls="document-actions-panel" tabIndex={query.view === view.value ? 0 : -1}
        disabled={busy} onClick={() => changeView(view.value)} onKeyDown={(event) => navigateTabs(event, index)}>{view.label}</button>)}
    </div>
    <div id="document-actions-panel" className={styles.panel} role="tabpanel" aria-labelledby={`document-actions-tab-${query.view}`}>
    {isSyncView ? <p className={styles.notice}>Поточна черга обміну. Зняти можна лише ручну реєстрацію. Документи, що потребують автоматичного обміну за станом УП, залишаються в черзі.</p> : null}
    <form className={styles.filters} onSubmit={applyFilters}>
      <label><span>З дати</span><FormInput compact type="date" value={filters.dateFrom} onChange={(event) => changeFilter("dateFrom", event.target.value)} /></label>
      <label><span>До дати</span><FormInput compact type="date" value={filters.dateTo} onChange={(event) => changeFilter("dateTo", event.target.value)} /></label>
      <label><span>Статус порталу</span><CompactSelect ariaLabel="Статус порталу" value={filters.status} options={STATUSES} onChange={(value) => changeFilter("status", value)} /></label>
      <label className={styles.search}><span>Номер, контрагент або торгова точка</span><FormInput compact type="search" maxLength={150} value={filters.search} onChange={(event) => changeFilter("search", event.target.value)} /></label>
      <button type="submit" disabled={loading || busy}>Показати</button>
    </form>
    <div className={styles.toolbar}>
      <span>Вибрано: {selected.size} / {data.pageSize}</span>
      <button type="button" disabled={loading || busy || !selectableRows.length} onClick={selectPage}>{isSyncView ? "Вибрати ручні реєстрації" : "Вибрати сторінку"}</button>
      <button type="button" disabled={!selected.size} onClick={() => setSelected(new Set())}>Зняти вибір</button>
      {availableActions.map((action) => <button key={action} type="button" disabled={loading || busy || !selected.size} onClick={() => openAction(action)}>{ACTIONS[action]}</button>)}
    </div>
    {error && !confirmation ? <p className={styles.error} role="alert">{error}</p> : null}
    {report ? <details className={styles.report} open={report.failed > 0}>
      <summary>{ACTIONS[report.action]}: виконано {report.completed}, без змін {report.unchanged}, помилок {report.failed}</summary>
      <ul>{report.results.map((item) => <li key={item.id} className={item.outcome === "failed" ? styles.error : undefined}>
        <strong>{item.number}</strong>: {item.outcome === "failed" ? item.message : report.action === "unsync"
          ? item.still_pending ? "Ручну реєстрацію знято; автоматичний обмін триває" : item.outcome === "unchanged" ? "Ручну реєстрацію вже знято" : "Знято з реєстрації"
          : item.already_pending ? "Уже в черзі синхронізації" : item.outcome === "unchanged" ? "Без змін" : "Виконано"}
      </li>)}</ul>
    </details> : null}
    <div className={styles.results} aria-busy={loading}>
      {loading ? <p className={styles.empty}>Завантаження…</p> : !data.data.length ? <p className={styles.empty}>Документів за вибраними умовами немає.</p> : <table>
        <thead><tr><th><FormInput type="checkbox" aria-label={isSyncView ? "Вибрати всі ручні реєстрації на сторінці" : "Вибрати всі документи на сторінці"} disabled={loading || busy || !selectableRows.length} checked={selectableRows.length > 0 && selected.size === selectableRows.length} onChange={(event) => event.target.checked ? selectPage() : setSelected(new Set())} /></th><th>Документ</th><th>Контрагент / торгова точка</th><th>Статус порталу</th><th>Стан в УП</th><th>Синхронізація</th></tr></thead>
        <tbody>{data.data.map((row) => <tr key={row.id} data-selected={selected.has(row.id)}>
          <td><FormInput type="checkbox" aria-label={`Вибрати ${row.document_number}`} disabled={loading || busy || (isSyncView && !row.status_sync_requested_at)} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
          <td data-label="Документ"><strong>{row.document_number}</strong><small>{displayDate(row.document_date)} · {[row.branch_name, row.city_name].filter(Boolean).join(" / ")}</small></td>
          <td data-label="Контрагент"><span>{row.contractor_name || "—"}</span><small>{row.trade_point_name || "—"}</small></td>
          <td data-label="Статус"><StatusBadge status={row.status} showLabel /></td>
          <td data-label="УП">{getOneCStageLabel(row.one_c_stage)}<small>{row.up_document_number || "—"}</small></td>
          <td data-label="Синхронізація">{row.status_sync_requested_at ? "Зареєстровано вручну" : Number(row.sync_pending) ? "У черзі" : Number(row.can_sync) ? "Поза чергою" : "Без зв’язку з УП"}
            {isSyncView && !row.status_sync_requested_at ? <small>Автоматичний обмін за станом УП</small> : null}</td>
        </tr>)}</tbody>
      </table>}
    </div>
    <footer className={styles.pagination}>
      <span>Знайдено: {data.total} · Сторінка {query.page} з {pageCount}</span>
      <button type="button" disabled={loading || query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>Назад</button>
      <button type="button" disabled={loading || query.page >= pageCount} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Далі</button>
    </footer>
    </div>
    {confirmation ? <dialog ref={dialogRef} className={styles.confirmation} aria-labelledby="document-actions-title" onCancel={(event) => { event.preventDefault(); if (!busy) setConfirmation(null); }}>
      <form onSubmit={execute}>
        <header><h3 id="document-actions-title">{ACTIONS[confirmation.action]}</h3></header>
        <div className={styles.confirmationBody}>
          <p>Вибрано документів: {confirmation.documents.length}</p>
          <ul>{confirmation.documents.map((row) => <li key={row.id}>{row.document_number}</li>)}</ul>
          <p>{confirmation.action === "unsync"
            ? "Ручну реєстрацію буде знято. Статуси та дані документів не зміняться. За наявності підстав для автоматичного обміну документ залишиться в черзі. Уже отриманий обробкою УП запит може завершитися."
            : confirmation.action === "sync"
            ? "Заявки зі зв’язком УП буде додано до поточної черги. Уже зареєстровані заявки залишаться без змін. Статуси порталу та УП не змінюються."
            : confirmation.action === "revision"
              ? "Повернення доступне лише до обробки в УП і бухгалтерських відміток. Попередній підпис буде знято."
              : "Заявки отримають статус «Скасовано». Бухгалтерські дані та зв’язки з УП збережуться."}</p>
          <label><span>Причина *</span><FormInput autoFocus required maxLength={250} value={comment} disabled={busy} onChange={(event) => setComment(event.target.value)} /></label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
        <footer><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Закрити</button><button type="submit" disabled={busy || !comment.trim()}>{busy ? "Виконання…" : "Виконати"}</button></footer>
      </form>
    </dialog> : null}
  </section>;
}
