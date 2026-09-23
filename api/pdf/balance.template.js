function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);

  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 3,
  }).format(value);
}

export function flattenBalanceRows(items, columns, level = 0, result = []) {
  for (const item of items || []) {
    result.push({
      level,
      isGroup: Boolean(item.children?.length),
      values: columns.map((column) => column.role === "hierarchy"
        ? item.productNameCell
        : item.configuredValues?.[column.id]),
    });

    if (item.children?.length) {
      flattenBalanceRows(item.children, columns, level + 1, result);
    }
  }

  return result;
}

export function renderBalanceHtml({ warehouseName, actualAt, columns, hierarchy }) {
  const printableColumns = columns?.length
    ? columns.filter((column) => !column.isPrice)
    : [
        { id: "legacy-name", title: "Номенклатура", role: "hierarchy" },
        { id: "legacy-balance", title: "Залишок", role: "legacy-balance" },
      ];
  const rows = columns?.length
    ? flattenBalanceRows(hierarchy, printableColumns)
    : flattenBalanceRows(
        (hierarchy || []).map(function mapLegacy(item) {
          return {
            ...item,
            configuredValues: { "legacy-balance": item.productQuantityCell?.join(", ") },
            children: item.children?.map(mapLegacy) || [],
          };
        }),
        printableColumns,
      );

  const headerCells = printableColumns
    .map((column) => `<th>${escapeHtml(column.title)}</th>`)
    .join("");
  const bodyRows = rows.map((row) => {
    const cells = row.values.map((value, index) => {
      const hierarchyCell = printableColumns[index].role === "hierarchy";
      const indent = hierarchyCell ? Math.min(row.level, 6) * 12 : 0;
      const className = hierarchyCell ? "hierarchy-cell" : "value-cell";
      return `<td class="${className}" style="--indent:${indent}px">${escapeHtml(formatValue(value))}</td>`;
    }).join("");
    return `<tr class="${row.isGroup ? "group-row" : "data-row"}">${cells}</tr>`;
  }).join("");

  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #172033; font-family: Arial, sans-serif; font-size: 9px; }
    h1 { margin: 0 0 5px; font-size: 16px; }
    .meta { margin: 0 0 12px; color: #45546a; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border: 1px solid #aeb9c8; padding: 4px 6px; vertical-align: middle; }
    th { background: #dfe8f2; color: #172033; font-weight: 700; text-align: left; }
    .value-cell { text-align: right; white-space: nowrap; }
    .hierarchy-cell { padding-left: calc(6px + var(--indent)); }
    .group-row td { background: #edf2f7; font-weight: 700; }
    .data-row:nth-child(even) td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Склад: ${escapeHtml(warehouseName || "—")}</h1>
  <p class="meta">Залишок актуальний на: ${escapeHtml(actualAt || "—")}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}
