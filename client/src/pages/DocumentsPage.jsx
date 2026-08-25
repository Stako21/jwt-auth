import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import DocumentTable from "../components/Documents/DocumentsTable.jsx";
import { fetchDocuments, getDocumentById } from "../services/documents.api.js";
import { AuthContext } from "../context/AuthContext.jsx";
import CreateReturnDocumentModal from "../modals/CreateReturnDocumentModal.jsx";
import {
  fetchContractors,
  fetchProductGroups,
  fetchProducts,
  fetchTradePoints,
} from "../services/directories.api.js";
import CreateExchangeDocumentModal from "../modals/CreateExchangeDocumentModal.jsx";
import { DataLoader } from "../components/DataLoader/DataLoader.jsx";
import {
  filterDocuments,
  getDocumentAuthorOptions,
} from "../utils/documentFilters.js";
import style from "./DocumentsPage.module.scss";

const DOCUMENT_STATUSES = [
  { value: "NEW", label: "Новий" },
  { value: "PREPARED", label: "Погоджено" },
  { value: "REVISION", label: "На доопрацювання" },
  { value: "REJECTED", label: "Відхилено" },
  { value: "SIGNED", label: "Підписано" },
];

function dateKey(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialPeriod() {
  const now = new Date();
  return {
    from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    withoutFrom: false,
    withoutTo: false,
  };
}

const EMPTY_FILTERS = Object.freeze({
  statuses: [],
  contractor: "",
  authorId: "",
});

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tradePoints, setTradePoints] = useState([]);
  const [products, setProducts] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const { userInfo } = useContext(AuthContext);
  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [showCreateExchange, setShowCreateExchange] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [period, setPeriod] = useState(initialPeriod);
  const [appliedPeriod, setAppliedPeriod] = useState(initialPeriod);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS }));
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...EMPTY_FILTERS }));
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const currentBranchName =
    userInfo?.currentBranch?.shortName || userInfo?.currentBranch?.name || null;

  useEffect(() => {
    Promise.all([
      fetchTradePoints(),
      fetchProducts(),
      fetchContractors(),
      fetchProductGroups(),
    ])
      .then(([nextTradePoints, nextProducts, nextContractors, nextProductGroups]) => {
        setTradePoints(nextTradePoints);
        setProducts(nextProducts);
        setContractors(nextContractors);
        setProductGroups(nextProductGroups);
      })
      .catch((directoryError) => {
        console.error("Помилка завантаження довідників:", directoryError);
      });
  }, []);

  const loadDocuments = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await fetchDocuments({
        ...(appliedPeriod.withoutFrom ? {} : { from: appliedPeriod.from }),
        ...(appliedPeriod.withoutTo ? {} : { to: appliedPeriod.to }),
      });
      setDocuments(data);
    } catch (loadError) {
      console.error("Помилка завантаження документів:", loadError);
      setError("Помилка завантаження документів");
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) loadDocuments({ silent: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [loadDocuments]);

  const authorOptions = useMemo(
    () => getDocumentAuthorOptions(documents),
    [documents],
  );

  const filteredDocuments = useMemo(
    () => filterDocuments(documents, appliedFilters),
    [appliedFilters, documents],
  );

  const activeFilterCount =
    Number(filters.statuses.length > 0) +
    Number(Boolean(filters.contractor)) +
    Number(Boolean(filters.authorId));

  const statusSummary =
    filters.statuses.length === 0
      ? "Усі статуси"
      : filters.statuses.length === 1
        ? DOCUMENT_STATUSES.find((status) => status.value === filters.statuses[0])
            ?.label
        : `${filters.statuses.length} обрано`;

  const applyFilters = (event) => {
    event.preventDefault();
    if (!period.withoutFrom && !period.withoutTo && period.from > period.to) {
      setError("Початкова дата не може бути пізніше кінцевої");
      return;
    }
    setError(null);
    setAppliedPeriod({ ...period });
    setAppliedFilters({ ...filters, statuses: [...filters.statuses] });
    setIsMobileFiltersOpen(false);
  };

  const resetFilters = () => {
    const defaultPeriod = initialPeriod();
    setPeriod(defaultPeriod);
    setAppliedPeriod(defaultPeriod);
    setFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
  };

  const toggleStatus = (statusValue) => {
    setFilters((current) => ({
      ...current,
      statuses: current.statuses.includes(statusValue)
        ? current.statuses.filter((status) => status !== statusValue)
        : [...current.statuses, statusValue],
    }));
  };

  const openDocumentModal = (doc, viewOnly = false) => {
    setIsViewOnly(viewOnly);
    getDocumentById(doc.id)
      .then((fullDoc) => {
        setEditingDocument(fullDoc);
        if (fullDoc.documentType === "RETURN") setShowCreateReturn(true);
        if (fullDoc.documentType === "EXCHANGE") setShowCreateExchange(true);
      })
      .catch((loadError) => {
        console.error("Помилка завантаження документа:", loadError);
        setError("Помилка завантаження даних документа");
      });
  };

  const closeDocumentModal = (type) => {
    if (type === "RETURN") setShowCreateReturn(false);
    if (type === "EXCHANGE") setShowCreateExchange(false);
    setEditingDocument(null);
    setIsViewOnly(false);
  };

  return (
    <section className={style.documentsPage}>
      <div className={style.pageHeader}>
        <div className={style.pageHeading}>
          <h1>Документи</h1>
          {currentBranchName ? (
            <span className={style.branchBadge}>{currentBranchName}</span>
          ) : null}
        </div>
        <div className={style.createActions}>
          <button type="button" onClick={() => setShowCreateReturn(true)}>
            <i className="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
            Повернення
          </button>
          <button type="button" onClick={() => setShowCreateExchange(true)}>
            <i className="fa-solid fa-right-left" aria-hidden="true"></i>
            Обмін
          </button>
        </div>
      </div>

      <button
        className={style.mobileFilterToggle}
        type="button"
        onClick={() => setIsMobileFiltersOpen((open) => !open)}
        aria-expanded={isMobileFiltersOpen}
        aria-controls="document-filters"
      >
        <span>
          <i className="fa-solid fa-filter" aria-hidden="true"></i>
          Фільтри
          {activeFilterCount > 0 ? (
            <span className={style.filterCount}>{activeFilterCount}</span>
          ) : null}
        </span>
        <i
          className={`fa-solid fa-chevron-${isMobileFiltersOpen ? "up" : "down"}`}
          aria-hidden="true"
        ></i>
      </button>

      <form
        id="document-filters"
        className={`${style.filterPanel} ${
          isMobileFiltersOpen ? style.mobileFiltersOpen : ""
        }`}
        onSubmit={applyFilters}
      >
        <div className={style.dateControl}>
          <div className={style.filterLabelRow}>
            <label htmlFor="documents-date-from">З</label>
            <label className={style.unboundedToggle}>
              <input
                type="checkbox"
                checked={period.withoutFrom}
                onChange={(event) =>
                  setPeriod((current) => ({
                    ...current,
                    withoutFrom: event.target.checked,
                  }))
                }
              />
              Без обмеження
            </label>
          </div>
          <input
            id="documents-date-from"
            type="date"
            value={period.from}
            disabled={period.withoutFrom}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, from: event.target.value }))
            }
          />
        </div>

        <div className={style.dateControl}>
          <div className={style.filterLabelRow}>
            <label htmlFor="documents-date-to">По</label>
            <label className={style.unboundedToggle}>
              <input
                type="checkbox"
                checked={period.withoutTo}
                onChange={(event) =>
                  setPeriod((current) => ({
                    ...current,
                    withoutTo: event.target.checked,
                  }))
                }
              />
              Без обмеження
            </label>
          </div>
          <input
            id="documents-date-to"
            type="date"
            value={period.to}
            disabled={period.withoutTo}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, to: event.target.value }))
            }
          />
        </div>

        <div className={style.filterControl}>
          <span className={style.filterLabel}>Статус</span>
          <details className={style.statusSelect}>
            <summary>{statusSummary}</summary>
            <div className={style.statusOptions}>
              {DOCUMENT_STATUSES.map((status) => (
                <label key={status.value}>
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(status.value)}
                    onChange={() => toggleStatus(status.value)}
                  />
                  {status.label}
                </label>
              ))}
            </div>
          </details>
        </div>

        <label className={style.filterControl}>
          <span className={style.filterLabel}>Контрагент</span>
          <select
            value={filters.contractor}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                contractor: event.target.value,
              }))
            }
          >
            <option value="">Усі контрагенти</option>
            {[...contractors]
              .sort((left, right) => left.name.localeCompare(right.name, "uk"))
              .map((contractor) => (
                <option key={contractor.id} value={contractor.name}>
                  {contractor.name}
                </option>
              ))}
          </select>
        </label>

        <label className={style.filterControl}>
          <span className={style.filterLabel}>Автор</span>
          <select
            value={filters.authorId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                authorId: event.target.value,
              }))
            }
          >
            <option value="">Усі автори</option>
            {authorOptions.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
          </select>
        </label>

        <div className={style.filterActions}>
          <button
            className={style.resetButton}
            type="button"
            onClick={resetFilters}
            title="Очистити"
            aria-label="Очистити фільтри"
          >
            <i className="fa-solid fa-filter-circle-xmark" aria-hidden="true"></i>
          </button>
          <button className={style.applyButton} type="submit">
            Показати
          </button>
        </div>
      </form>

      {showCreateReturn ? (
        <CreateReturnDocumentModal
          isOpen={showCreateReturn}
          onClose={() => closeDocumentModal("RETURN")}
          onCreated={loadDocuments}
          tradePoints={tradePoints}
          products={products}
          contractors={contractors}
          productGroups={productGroups}
          editingDocument={editingDocument}
          isViewOnly={isViewOnly}
        />
      ) : null}

      {showCreateExchange ? (
        <CreateExchangeDocumentModal
          isOpen={showCreateExchange}
          onClose={() => closeDocumentModal("EXCHANGE")}
          onCreated={loadDocuments}
          tradePoints={tradePoints}
          products={products}
          contractors={contractors}
          productGroups={productGroups}
          editingDocument={editingDocument}
          isViewOnly={isViewOnly}
        />
      ) : null}

      {loading ? <DataLoader label="Завантаження документів…" /> : null}
      {error ? <div className={style.errorBanner}>{error}</div> : null}

      {!loading && !error ? (
        <DocumentTable
          documents={filteredDocuments}
          currentUser={userInfo}
          reloadDocuments={loadDocuments}
          onEditDocument={(doc) => openDocumentModal(doc, false)}
          onViewDocument={(doc) => openDocumentModal(doc, true)}
        />
      ) : null}
    </section>
  );
}
