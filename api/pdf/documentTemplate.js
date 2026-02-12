export function renderDocumentHtml(doc) {
  const escapeHtml = (str) => {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("uk-UA");
  };

  const itemsRows = doc.items
    .map(
      (i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(i.product_group)}</td>
        <td>${escapeHtml(i.product_name)}</td>
        <td>${escapeHtml(i.unit)}</td>
        <td>${i.quantity}</td>
        <td>${formatDate(i.manufacture_date)}</td>
        <td>${formatDate(i.expiry_date)}</td>
      </tr>
    `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<style>
body { font-family: Arial, sans-serif; font-size: 12px; }
h1 { text-align: center; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000; padding: 4px; }
th { background: #eee; }
.footer { margin-top: 40px; }
</style>
</head>
<body>

<h1>${doc.documentType === "RETURN" ? "АКТ ПОВЕРНЕННЯ" : "АКТ ЗАМІНИ"}</h1>

<p><b>Номер:</b> ${escapeHtml(doc.documentNumber)}</p>
<p><b>Дата:</b> ${formatDate(doc.documentDate)}</p>
<p><b>Торгова точка:</b> ${escapeHtml(doc.tradePoint.name)}</p>
<p><b>Адреса:</b> ${escapeHtml(doc.tradePoint.address)}</p>
<p><b>Контрагент:</b> ${escapeHtml(doc.contractor.name)}</p>
<p><b>Причина:</b> ${escapeHtml(doc.reason)}</p>

<table>
<thead>
<tr>
  <th>№</th>
  <th>Група</th>
  <th>Номенклатура</th>
  <th>Од.</th>
  <th>К-ть</th>
  <th>С</th>
  <th>По</th>
</tr>
</thead>
<tbody>
${itemsRows}
</tbody>
</table>

<div class="footer">
<p><b>Автор:</b> ${escapeHtml(doc.author)}</p>
<p><b>Статус:</b> ${doc.status}</p>
</div>

</body>
</html>
`;
}
