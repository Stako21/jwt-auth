function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("uk-UA");
}

export function openDocumentRegistryPrintWindow() {
  const printWindow = window.open("", "_blank");
  if (printWindow) printWindow.opener = null;
  return printWindow;
}

export function renderDocumentRegistryForPrint(printWindow, registry) {
  if (!printWindow) return;

  const headings = registry.columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const rows = registry.rows
    .map(
      (row) => `<tr>${registry.columns
        .map((column) => `<td>${escapeHtml(row[column.key])}</td>`)
        .join("")}</tr>`,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="uk">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(registry.title)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; font-size: 8pt; }
      h1 { margin: 0 0 3mm; font-size: 14pt; }
      .meta { display: flex; justify-content: space-between; gap: 8mm; margin-bottom: 3mm; font-size: 8pt; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      th, td { padding: 1.5mm; border: 1px solid currentColor; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-line; }
      th { font-weight: 700; }
      tr { break-inside: avoid; }
      @media print { .no-print { display: none; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(registry.title)}</h1>
    <div class="meta">
      <span>Документів: ${escapeHtml(registry.count)}</span>
      <span>Сформовано: ${escapeHtml(formatGeneratedAt(registry.generatedAt))}</span>
    </div>
    <table>
      <thead><tr>${headings}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 150);
}
