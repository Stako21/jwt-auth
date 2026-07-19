import { useContext, useEffect, useState } from "react";
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
  const currentBranchName =
    userInfo?.currentBranch?.name ||
    userInfo?.currentBranch?.shortName ||
    null;
  const hasMultipleBranches = (userInfo?.availableBranches?.length || 0) > 1;

  useEffect(() => {
    fetchTradePoints().then((data) => setTradePoints(data));
    fetchProducts().then((data) => setProducts(data));
    fetchContractors().then((data) => setContractors(data));
    fetchProductGroups().then((data) => setProductGroups(data));
  }, []);

  async function loadDocuments({ silent = false } = {}) {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await fetchDocuments();
      setDocuments(data);
    } catch (e) {
      setError("Помилка завантаження документів");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadDocuments({ silent: true });
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const openDocumentModal = (doc, viewOnly = false) => {
    setIsViewOnly(viewOnly);

    getDocumentById(doc.id)
      .then((fullDoc) => {
        setEditingDocument(fullDoc);
        if (fullDoc.documentType === "RETURN") {
          setShowCreateReturn(true);
        } else if (fullDoc.documentType === "EXCHANGE") {
          setShowCreateExchange(true);
        }
      })
      .catch((e) => {
        console.error("Помилка завантаження документа:", e);
        alert("Помилка при завантаженні даних документа");
      });
  };

  const handleEditDocument = (doc) => {
    openDocumentModal(doc, false);
  };

  const handleViewDocument = (doc) => {
    openDocumentModal(doc, true);
  };

  return (
    <section className="section">
      <div className="container">
        <div className="level mb-4">
          <div className="level-left">
            <div>
              <h1 className="title is-4 mb-2">Документи</h1>
              {currentBranchName && (
                <div className="is-flex is-align-items-center" style={{ gap: 8 }}>
                  <span className="tag is-dark is-light">
                    Філія: {currentBranchName}
                  </span>
                  {hasMultipleBranches && (
                    <span className="is-size-7 has-text-grey">
                      Створення та зміна статусів працює у поточному
                      branch-контексті
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="level-right">
            <button
              className="button is-primary"
              onClick={() => setShowCreateReturn(true)}
            >
              <i className="fa-solid fa-plus">{"\u00A0"}</i> Повернення
            </button>
            <button
              className="button is-primary"
              onClick={() => setShowCreateExchange(true)}
            >
              <i className="fa-solid fa-plus">{"\u00A0"}</i> Обмін
            </button>
          </div>
        </div>

        {showCreateReturn && (
          <CreateReturnDocumentModal
            isOpen={showCreateReturn}
            onClose={() => {
              setShowCreateReturn(false);
              setEditingDocument(null);
              setIsViewOnly(false);
            }}
            onCreated={loadDocuments}
            tradePoints={tradePoints}
            products={products}
            contractors={contractors}
            productGroups={productGroups}
            editingDocument={editingDocument}
            isViewOnly={isViewOnly}
          />
        )}

        {showCreateExchange && (
          <CreateExchangeDocumentModal
            isOpen={showCreateExchange}
            onClose={() => {
              setShowCreateExchange(false);
              setEditingDocument(null);
              setIsViewOnly(false);
            }}
            onCreated={loadDocuments}
            tradePoints={tradePoints}
            products={products}
            contractors={contractors}
            productGroups={productGroups}
            editingDocument={editingDocument}
            isViewOnly={isViewOnly}
          />
        )}

        {loading && <DataLoader label="Завантаження документів…" />}

        {error && <div className="notification is-danger">{error}</div>}

        {!loading && !error && (
          <DocumentTable
            documents={documents}
            currentUser={userInfo}
            reloadDocuments={loadDocuments}
            onEditDocument={handleEditDocument}
            onViewDocument={handleViewDocument}
          />
        )}
      </div>
    </section>
  );
}
