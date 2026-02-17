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

  useEffect(() => {
    fetchTradePoints().then((data) => setTradePoints(data));
    fetchProducts().then((data) => setProducts(data));
    fetchContractors().then((data) => setContractors(data));
    fetchProductGroups().then((data) => setProductGroups(data));

    console.log("Trade-points", tradePoints.slice(5));
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

  // useEffect(() => {
  //   loadDocuments();

  //   const interval = setInterval(() => {
  //     if (!document.hidden) {
  //       loadDocuments();
  //     }
  //   }, 10000);

  //   return () => clearInterval(interval);
  // }, []);

  const handleEditDocument = (doc) => {
    console.log("handleEditDocument called with doc:", doc);
    // Получаем полные данные документа перед редактированием
    getDocumentById(doc.id)
      .then((fullDoc) => {
        console.log("Full document loaded:", fullDoc);
        setEditingDocument(fullDoc);
        // API возвращает documentType (camelCase)
        if (fullDoc.documentType === "RETURN") {
          console.log("Setting showCreateReturn to true");
          setShowCreateReturn(true);
        } else if (fullDoc.documentType === "EXCHANGE") {
          console.log("Setting showCreateExchange to true");
          setShowCreateExchange(true);
        }
      })
      .catch((e) => {
        console.error("Помилка завантаження документу:", e);
        alert("Помилка при завантаженні даних документу");
      });
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  return (
    <section className="section">
      <div className="container">
        <div className="level mb-4">
          <div className="level-left">
            <h1 className="title is-4">Документи</h1>
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
            }}
            onCreated={loadDocuments}
            tradePoints={tradePoints}
            products={products}
            contractors={contractors}
            productGroups={productGroups}
            editingDocument={editingDocument}
          />
        )}

        {showCreateExchange && (
          <CreateExchangeDocumentModal
            isOpen={showCreateExchange}
            onClose={() => {
              setShowCreateExchange(false);
              setEditingDocument(null);
            }}
            onCreated={loadDocuments}
            tradePoints={tradePoints}
            products={products}
            contractors={contractors}
            productGroups={productGroups}
            editingDocument={editingDocument}
          />
        )}

        {loading && <progress className="progress is-small is-primary" />}

        {error && <div className="notification is-danger">{error}</div>}

        {!loading && !error && (
          <DocumentTable
            documents={documents}
            currentUser={userInfo}
            reloadDocuments={loadDocuments}
            onEditDocument={handleEditDocument}
          />
        )}
      </div>
    </section>
  );
}
