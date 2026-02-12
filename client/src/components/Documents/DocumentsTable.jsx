import { openDocumentPdf } from "../../services/documents.api";
import DocumentRowActions from "./DocumentRowAction";
import StatusBadge from "./StatusBadge";
import { useState } from "react";

export default function DocumentTable({
  documents,
  currentUser,
  reloadDocuments,
}) {
  const [loadingId, setLoadingId] = useState(null);

  const handleOpenPdf = async (id) => {
    try {
      setLoadingId(id);
      await openDocumentPdf(id);
    } catch (e) {
      console.error("Error opening PDF:", e);
    } finally {
      setLoadingId(null);
    }
  };

  if (!documents.length) {
    return <div className="notification is-light">Документів не знайдено</div>;
  }

  return (
    <div className="table-container" style={{ fontSize: "12px" }}>
      <table className="table is-striped is-hoverable is-fullwidth">
        <thead>
          <tr>
            <th>Статус</th>
            <th>№</th>
            <th>Тип</th>
            <th>Торгова точка</th>
            <th>Контрагент</th>
            <th>Автор</th>
            <th>Дата</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <StatusBadge status={doc.status} />
              </td>
              <td>{doc.document_number}</td>
              <td>
                {doc.document_type === "RETURN" ? "ПОВЕРНЕННЯ" : "ЗАМІНА"}
              </td>
              <td>{doc.trade_point}</td>
              <td>{doc.contractor}</td>
              <td>{doc.author}</td>
              <td>{new Date(doc.document_date).toLocaleDateString("uk-UA")}</td>
              {/* <td className="has-text-right">
                <button
                  className={`button is-small is-light ${loadingId === doc.id ? "is-loading" : ""}`}
                  onClick={() => handleOpenPdf(doc.id)}
                  disabled={loadingId !== null}
                >
                  PDF
                </button>
              </td> */}
              <td className="has-text-right">
                <DocumentRowActions
                  doc={doc}
                  currentUser={currentUser}
                  onUpdated={reloadDocuments}
                  onOpenPdf={handleOpenPdf}
                  loadingId={loadingId}
                  setLoadingId={setLoadingId}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
