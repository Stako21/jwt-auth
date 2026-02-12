import { useContext, useEffect, useState } from "react";
import DocumentTable from "../components/Documents/DocumentsTable.jsx";
import { fetchDocuments } from "../services/documents.api.js";
import { AuthContext } from "../context/AuthContext.jsx";
import CreateReturnDocumentModal from "../modals/CreateReturnDocumentModal.jsx";
import { fetchContractors, fetchProductGroups, fetchProducts, fetchTradePoints } from "../services/directories.api.js";
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

  useEffect(() => {
    fetchTradePoints().then((data) => setTradePoints(data));
    fetchProducts().then((data) => setProducts(data));
    fetchContractors().then((data) => setContractors(data));
    fetchProductGroups().then((data) => setProductGroups(data));

    console.log("Trade-points", tradePoints.slice(5));
    
  }, []);


  async function loadDocuments() {
    try {
      setLoading(true);
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
              ➕ Повернення
            </button>
            <button
              className="button is-primary"
              onClick={() => setShowCreateExchange(true)}
            >
              ➕ Обмін
            </button>
          </div>
        </div>

        <CreateReturnDocumentModal
          isOpen={showCreateReturn}
          onClose={() => setShowCreateReturn(false)}
          onCreated={loadDocuments}
          tradePoints={tradePoints}
          products={products}
          contractors={contractors}
          productGroups={productGroups}
        />

        <CreateExchangeDocumentModal
          isOpen={showCreateExchange}
          onClose={() => setShowCreateExchange(false)}
          onCreated={loadDocuments}
          tradePoints={tradePoints}
          products={products}
          contractors={contractors}
          productGroups={productGroups}
        />

        {loading && <progress className="progress is-small is-primary" />}

        {error && <div className="notification is-danger">{error}</div>}

        {!loading && !error && (
          <DocumentTable
            documents={documents}
            currentUser={userInfo}
            reloadDocuments={loadDocuments}
          />
        )}
      </div>
    </section>
  );
}
