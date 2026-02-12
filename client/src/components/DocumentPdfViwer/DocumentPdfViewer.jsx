import { useState } from "react";

export default function DocumentPdfViewer() {
  const [docId, setDocId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPdf = async () => {
    if (!docId) {
      setError("Введіть ID документа");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("accessToken");

      const response = await fetch(
        // `${import.meta.env.VITE_API_URL || ""}/documents/${docId}/pdf`,
        `/documents/${docId}/pdf`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Помилка завантаження: ${response.status}`);
      }

      const blob = await response.blob();

      // создаём временную ссылку
      const url = window.URL.createObjectURL(blob);

      // создаём <a> и кликаем по нему
      const a = document.createElement("a");
      a.href = url;
      a.download = `document-${docId}.pdf`; // можно потом заменить на номер документа
      document.body.appendChild(a);
      a.click();
      a.remove();

      // освобождаем память
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400 }}>
      <h3>Завантаження документа (PDF)</h3>

      <input
        type="number"
        placeholder="ID документа"
        value={docId}
        onChange={(e) => setDocId(e.target.value)}
        style={{ width: "100%", marginBottom: 10 }}
      />

      <button onClick={loadPdf} disabled={loading}>
        {loading ? "Завантаження..." : "Завантажити PDF"}
      </button>

      {error && (
        <div style={{ color: "red", marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}