import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSnackbar } from "notistack";
import FormInput from "../components/FormControl/FormInput.jsx";
import FormSelect from "../components/FormControl/FormSelect.jsx";
import DocumentTable from "../components/Documents/DocumentsTable.jsx";
import {
  downloadSelectedDocumentsXlsx,
  fetchDocuments,
  fetchDocumentRegistryColumns,
  fetchSelectedDocumentRegistry,
  getDocumentById,
} from "../services/documents.api.js";
import { AuthContext } from "../context/AuthContext.jsx";
import CreateReturnDocumentModal from "../modals/CreateReturnDocumentModal.jsx";
import {
  fetchContractors,
  fetchProductGroups,
  fetchProducts,
  fetchTradePoints,
  fetchTroProducts,
} from "../services/directories.api.js";
import CreateExchangeDocumentModal from "../modals/CreateExchangeDocumentModal.jsx";
import { DataLoader } from "../components/DataLoader/DataLoader.jsx";
import DateInput from "../components/DateInput/DateInput.jsx";
import {
  filterDocuments,
  getDocumentAuthorOptions,
} from "../utils/documentFilters.js";
import { UI_TIMING } from "../uiTokens.js";
import { getTroTaOptions } from "../services/documents.api.js";
import CreateTroDocumentModal from "../modals/CreateTroDocumentModal.jsx";
import { ROLE_IDS } from "../utils/roles.js";
import {
  openDocumentRegistryPrintWindow,
  renderDocumentRegistryForPrint,
} from "../utils/printDocumentRegistry.js";
import DocumentRegistryOptionsModal from "../components/Documents/DocumentRegistryOptionsModal.jsx";
import style from "./DocumentsPage.module.scss";

const RETURN_EXCHANGE_STATUSES = [
  { value: "NEW", label: "Новий" },
  { value: "PREPARED", label: "Погоджено" },
  { value: "REVISION", label: "На доопрацювання" },
  { value: "REJECTED", label: "Відхилено" },
  { value: "SIGNED", label: "Підписано" },
];

const TRO_STATUSES = [
  { value: "NEW", label: "Новий" },
  { value: "REVISION", label: "На доопрацювання" },
  { value: "REJECTED", label: "Відхилено" },
  { value: "NOT_COMPLETED", label: "Не виконано" },
  { value: "PLANNED", label: "Заплановано" },
  { value: "COMPLETED", label: "Виконано" },
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

export default function DocumentsPage({ category = "return-exchange" }) {
  const { enqueueSnackbar } = useSnackbar();
  const isTroPage = category === "tro";
  const documentStatuses = isTroPage ? TRO_STATUSES : RETURN_EXCHANGE_STATUSES;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tradePoints, setTradePoints] = useState([]);
  const [products, setProducts] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const [troProducts, setTroProducts] = useState([]);
  const [troTaOptions, setTroTaOptions] = useState([]);
  const { userInfo } = useContext(AuthContext);
  const [showCreateReturn, setShowCreateReturn] = useState(false);
  const [showCreateExchange, setShowCreateExchange] = useState(false);
  const [showCreateTro, setShowCreateTro] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [period, setPeriod] = useState(initialPeriod);
  const [appliedPeriod, setAppliedPeriod] = useState(initialPeriod);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS }));
  const [appliedFilters, setAppliedFilters] = useState(() => ({ ...EMPTY_FILTERS }));
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [contractorSearch, setContractorSearch] = useState("");
  const [showContractorDropdown, setShowContractorDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [registryAction, setRegistryAction] = useState("");
  const [registryOptions, setRegistryOptions] = useState(null);
  const [registryOptionsLoading, setRegistryOptionsLoading] = useState(false);

  const currentBranchName =
    userInfo?.currentBranch?.shortName || userInfo?.currentBranch?.name || null;

  useEffect(() => {
    const directoryRequests = isTroPage
      ? [
          fetchTradePoints(),
          fetchContractors(),
          fetchTroProducts(),
          getTroTaOptions(),
        ]
      : [
          fetchTradePoints(),
          fetchContractors(),
          fetchProducts(),
          fetchProductGroups(),
        ];

    Promise.all(directoryRequests)
      .then((results) => {
        const [nextTradePoints, nextContractors] = results;
        setTradePoints(nextTradePoints);
        setContractors(nextContractors);

        if (isTroPage) {
          setTroProducts(results[2]);
          setTroTaOptions(results[3]);
        } else {
          setProducts(results[2]);
          setProductGroups(results[3]);
        }
      })
      .catch((directoryError) => {
        console.error("Помилка завантаження довідників:", directoryError);
      });
  }, [isTroPage]);

  const loadDocuments = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await fetchDocuments({
        category,
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
  }, [appliedPeriod, category]);

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

  const filteredContractors = useMemo(() => {
    const query = contractorSearch.trim().toLocaleLowerCase("uk");
    return [...contractors]
      .sort((left, right) => left.name.localeCompare(right.name, "uk"))
      .filter(
        (contractor) =>
          !query || contractor.name.toLocaleLowerCase("uk").includes(query),
      );
  }, [contractorSearch, contractors]);

  const filteredDocuments = useMemo(
    () => filterDocuments(documents, appliedFilters),
    [appliedFilters, documents],
  );

  useEffect(() => {
    const visibleIds = new Set(filteredDocuments.map((doc) => Number(doc.id)));
    setSelectedIds((current) => {
      const next = new Set(
        Array.from(current).filter((documentId) => visibleIds.has(documentId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [category, filteredDocuments]);

  const selectedDocumentIds = useMemo(
    () => filteredDocuments
      .filter((doc) => selectedIds.has(Number(doc.id)))
      .map((doc) => Number(doc.id)),
    [filteredDocuments, selectedIds],
  );
  const allFilteredSelected =
    filteredDocuments.length > 0 &&
    selectedDocumentIds.length === filteredDocuments.length;

  const toggleDocumentSelection = (documentId) => {
    const normalizedId = Number(documentId);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(normalizedId)) next.delete(normalizedId);
      else next.add(normalizedId);
      return next;
    });
  };

  const toggleAllDocuments = () => {
    setSelectedIds(
      allFilteredSelected
        ? new Set()
        : new Set(filteredDocuments.map((doc) => Number(doc.id))),
    );
  };

  const openRegistryOptions = async (action) => {
    if (!selectedDocumentIds.length) return;
    setRegistryOptionsLoading(true);
    try {
      const options = await fetchDocumentRegistryColumns(category);
      setRegistryOptions({ action, columns: options.columns });
    } catch (actionError) {
      enqueueSnackbar(
        actionError?.response?.data?.error || "Не вдалося завантажити список колонок",
        { variant: "error" },
      );
    } finally {
      setRegistryOptionsLoading(false);
    }
  };

  const printSelectedDocuments = async (columnKeys) => {
    if (!selectedDocumentIds.length) return;

    const printWindow = openDocumentRegistryPrintWindow();
    if (!printWindow) {
      enqueueSnackbar("Дозвольте спливаюче вікно для друку реєстру", {
        variant: "warning",
      });
      return;
    }

    setRegistryAction("print");
    try {
      const registry = await fetchSelectedDocumentRegistry(
        selectedDocumentIds,
        category,
        columnKeys,
      );
      renderDocumentRegistryForPrint(printWindow, registry);
    } catch (actionError) {
      printWindow.close();
      enqueueSnackbar(
        actionError?.response?.data?.error || "Не вдалося сформувати реєстр",
        { variant: "error" },
      );
    } finally {
      setRegistryAction("");
    }
  };

  const exportSelectedDocuments = async (columnKeys) => {
    if (!selectedDocumentIds.length) return;
    setRegistryAction("xlsx");
    try {
      await downloadSelectedDocumentsXlsx(selectedDocumentIds, category, columnKeys);
      enqueueSnackbar("Реєстр XLSX збережено", { variant: "success" });
    } catch (actionError) {
      enqueueSnackbar(
        actionError?.response?.data?.error || "Не вдалося зберегти XLSX",
        { variant: "error" },
      );
    } finally {
      setRegistryAction("");
    }
  };

  const confirmRegistryOptions = async (columnKeys) => {
    const action = registryOptions?.action;
    if (!action) return;
    if (action === "print") await printSelectedDocuments(columnKeys);
    else await exportSelectedDocuments(columnKeys);
    setRegistryOptions(null);
  };

  const activeFilterCount =
    Number(filters.statuses.length > 0) +
    Number(Boolean(filters.contractor)) +
    Number(Boolean(filters.authorId));

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
    setContractorSearch("");
    setShowContractorDropdown(false);
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
        if (fullDoc.documentType === "TRO") setShowCreateTro(true);
      })
      .catch((loadError) => {
        console.error("Помилка завантаження документа:", loadError);
        setError("Помилка завантаження даних документа");
      });
  };

  const closeDocumentModal = (type) => {
    if (type === "RETURN") setShowCreateReturn(false);
    if (type === "EXCHANGE") setShowCreateExchange(false);
    if (type === "TRO") setShowCreateTro(false);
    setEditingDocument(null);
    setIsViewOnly(false);
  };

  return (
    <section className={style.documentsPage}>
      <div className={style.pageHeader}>
        <div className={style.pageHeading}>
          <h1>{isTroPage ? "Документи ТРО" : "Повернення / Обмін"}</h1>
          {currentBranchName ? (
            <span className={style.branchBadge}>{currentBranchName}</span>
          ) : null}
        </div>
        <div className={style.createActions}>
          {!isTroPage ? (
            <>
              <button type="button" onClick={() => setShowCreateReturn(true)}>
                <i className="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
                Повернення
              </button>
              <button type="button" onClick={() => setShowCreateExchange(true)}>
                <i className="fa-solid fa-right-left" aria-hidden="true"></i>
                Обмін
              </button>
            </>
          ) : null}
          {isTroPage && [ROLE_IDS.Admin, ROLE_IDS.Director, ROLE_IDS.SV, ROLE_IDS.TA].includes(Number(userInfo?.role)) ? (
            <button type="button" onClick={() => setShowCreateTro(true)}>
              <i className="fa-solid fa-shop" aria-hidden="true"></i>
              ТРО
            </button>
          ) : null}
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
              <FormInput
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
          <DateInput
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
              <FormInput
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
          <DateInput
            id="documents-date-to"
            type="date"
            value={period.to}
            disabled={period.withoutTo}
            onChange={(event) =>
              setPeriod((current) => ({ ...current, to: event.target.value }))
            }
          />
        </div>

        <div className={`${style.filterControl} ${style.statusFilter}`}>
          <span className={style.filterLabel}>Статус</span>
          <div className={style.statusChecklist}>
            {documentStatuses.map((status) => (
              <label key={status.value}>
                <FormInput
                  type="checkbox"
                  checked={filters.statuses.includes(status.value)}
                  onChange={() => toggleStatus(status.value)}
                />
                <span>{status.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={style.filterControl}>
          <span className={style.filterLabel}>Контрагент</span>
          <div className={style.contractorAutocomplete}>
            <FormInput
              value={contractorSearch}
              placeholder="Почніть вводити назву"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showContractorDropdown}
              aria-controls="document-contractor-options"
              onChange={(event) => {
                const nextSearch = event.target.value;
                setContractorSearch(nextSearch);
                setFilters((current) => ({
                  ...current,
                  contractor: nextSearch.trim(),
                }));
                setShowContractorDropdown(true);
              }}
              onFocus={() => setShowContractorDropdown(true)}
              onBlur={() =>
                window.setTimeout(
                  () => setShowContractorDropdown(false),
                  UI_TIMING.dropdownBlurDelayMs,
                )
              }
            />
            {showContractorDropdown && filteredContractors.length > 0 ? (
              <div
                id="document-contractor-options"
                className={style.contractorOptions}
                role="listbox"
              >
                {filteredContractors.map((contractor) => (
                  <button
                    key={contractor.id}
                    type="button"
                    role="option"
                    aria-selected={filters.contractor === contractor.name}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setContractorSearch(contractor.name);
                      setFilters((current) => ({
                        ...current,
                        contractor: contractor.name,
                      }));
                      setShowContractorDropdown(false);
                    }}
                  >
                    {contractor.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <label className={style.filterControl}>
          <span className={style.filterLabel}>Автор</span>
          <FormSelect
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
          </FormSelect>
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

      <div className={style.registryToolbar} aria-label="Дії з вибраними документами">
        <div className={style.registrySelection}>
          <label>
            <FormInput
              type="checkbox"
              checked={allFilteredSelected}
              disabled={!filteredDocuments.length}
              onChange={toggleAllDocuments}
            />
            <span>Вибрати всі показані</span>
          </label>
          <strong>Вибрано: {selectedDocumentIds.length}</strong>
        </div>
        <div className={style.registryActions}>
          <button
            type="button"
            disabled={!selectedDocumentIds.length || Boolean(registryAction) || registryOptionsLoading}
            onClick={() => openRegistryOptions("print")}
          >
            <i className="fa-solid fa-print" aria-hidden="true"></i>
            {registryAction === "print" ? "Формування…" : "Друк"}
          </button>
          <button
            type="button"
            disabled={!selectedDocumentIds.length || Boolean(registryAction) || registryOptionsLoading}
            onClick={() => openRegistryOptions("xlsx")}
          >
            <i className="fa-regular fa-file-excel" aria-hidden="true"></i>
            {registryAction === "xlsx" ? "Збереження…" : "Зберегти XLSX"}
          </button>
          <button
            className={style.clearSelection}
            type="button"
            disabled={!selectedDocumentIds.length || Boolean(registryAction)}
            onClick={() => setSelectedIds(new Set())}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            Зняти вибір
          </button>
        </div>
      </div>

      {registryOptions ? (
        <DocumentRegistryOptionsModal
          action={registryOptions.action}
          columns={registryOptions.columns}
          busy={Boolean(registryAction)}
          onClose={() => !registryAction && setRegistryOptions(null)}
          onConfirm={confirmRegistryOptions}
        />
      ) : null}

      {!isTroPage && showCreateReturn ? (
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

      {!isTroPage && showCreateExchange ? (
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

      {isTroPage && showCreateTro ? (
        <CreateTroDocumentModal
          isOpen={showCreateTro}
          onClose={() => closeDocumentModal("TRO")}
          onCreated={loadDocuments}
          contractors={contractors}
          tradePoints={tradePoints}
          troProducts={troProducts}
          taOptions={troTaOptions}
          currentUser={userInfo}
          editingDocument={editingDocument}
          isViewOnly={isViewOnly}
        />
      ) : null}

      {loading ? <DataLoader label="Завантаження документів…" /> : null}
      {error ? <div className={style.errorBanner}>{error}</div> : null}

      {!loading && !error ? (
        <div className={style.resultsViewport}>
          <DocumentTable
            documents={filteredDocuments}
            category={category}
            currentUser={userInfo}
            reloadDocuments={loadDocuments}
            onEditDocument={(doc) => openDocumentModal(doc, false)}
            onViewDocument={(doc) => openDocumentModal(doc, true)}
            selectedIds={selectedIds}
            onToggleSelection={toggleDocumentSelection}
            onToggleAll={toggleAllDocuments}
          />
        </div>
      ) : null}
    </section>
  );
}
