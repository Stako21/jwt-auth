
export function renderExchangeHtml(doc, stampBase64) {
  const takeItems = doc.items.filter((i) => i.operation === "TAKE");
  const giveItems = doc.items.filter((i) => i.operation === "GIVE");

  const STATUS_STAMP = {
    SIGNED: "stamps/SIGNED.png",
    REJECTED: "stamps/REJECTED.png",
    REVISION: "stamps/REVISION.png",
  };

  function formatDateTime(date) {
    if (!date) return "";
    return new Date(date).toLocaleString("uk-UA");
  }

  const stampImg = STATUS_STAMP[doc.status];
  // log("Stamp image path:", stampBase64);

  const UNIT_LABELS = {
    PCS: "шт",
    KG: "кг",
    BOX: "ящ",
    BLOCK: "блок",
  };

  function formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleDateString("uk-UA");
  }

  const renderRows = (items) =>
    items
      .map(
        (i, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${i.product_group}</td>
          <td>${i.product_name}</td>
          <td>${UNIT_LABELS[i.unit] || i.unit}</td>
          <td>${i.quantity}</td>
          <td>${formatDate(i.manufacture_date)}</td>
          <td>${formatDate(i.expiry_date)}</td>
        </tr>
      `,
      )
      .join("");

  const totalTake = takeItems.reduce(
    (sum, i) => sum + Number(i.quantity || 0),
    0,
  );
  const totalGive = giveItems.reduce(
    (sum, i) => sum + Number(i.quantity || 0),
    0,
  );

  return `
<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<style>
body {
  font-family: "DejaVu Sans", sans-serif;
  font-size: 12px;
}
.stamp {
  position: fixed;
  top: 90px;
  right: 20px;
  width: 260px;
  // transform: rotate(-30deg);
  opacity: 0.5; /* полупрозрачность */
  z-index: 1000;
}
.stamp-text {
  position: fixed;
  top: 40px;
  right: 24px;
  text-align: right;
  font-size: 11px;
  color: #000;
  opacity: 0.9;
  z-index: 1001;
}
h1 {
  text-align: center;
  font-size: 16px;
  margin-bottom: 10px;
}
.section-title {
  margin-top: 20px;
  font-weight: bold;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
}
th, td {
  border: 1px solid #000;
  padding: 4px;
  text-align: left;
  font-size: 10px;
}
th {
  background: #f0f0f0;
}
.signatures { margin-top: 40px; width: 210px;}
// .signatures div { margin-bottom: 20px; }
.signatures-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
</style>
</head>

<body>

${
  stampImg
    ? `
  ${stampBase64 ? `<img src="${stampBase64}" class="stamp" />` : ""}
  <div class="stamp-text">
  <div><b>
    ${
      doc.status === "SIGNED"
        ? "ПІДПИСАНО"
        : doc.status === "REJECTED"
          ? "ВІДХИЛЕНО"
          : doc.status === "REVISION"
            ? "ВИПРАВИТИ"
            : ""
    }
  </b></div>
  ${doc.signerName ? `<div>${doc.signerName}</div>` : `<div>${doc.history[doc.history.length - 1].user}</div>`}
  ${doc.signedAt ? `<div>${formatDateTime(doc.signedAt)}</div>` : `<div>${formatDateTime(doc.history[doc.history.length - 1].created_at)}</div>`}
  ${doc.history[doc.history.length - 1].comment ? `<div>Коментар: ${doc.history[doc.history.length - 1].comment}</div>` : ""}
</div>
`
    : ""
}

<h1>Накладна на ОБМІН ${doc.documentNumber} від ${formatDate(doc.documentDate)}</h1>

<p><b>Контрагент:</b> ${doc.contractor.name}</p>
<p><b>Торгівельна точка:</b> ${doc.tradePoint.name}</p>
<p><b>Адреса:</b> ${doc.tradePoint.address}</p>
<p><b>Через:</b> ${doc.author}</p>
<p><b>Причина обміну:</b> ${doc.reason}</p>

<div class="section-title">ЗАБРАТИ ВІД КЛІЄНТА</div>
<table>
<thead>
<tr>
  <th>№</th>
  <th>Група</th>
  <th>Номенклатура</th>
  <th>Од.</th>
  <th>К-ть</th>
  <th>Дата вигот.</th>
  <th>Кінцева дата</th>
</tr>
</thead>
<tbody>
${renderRows(takeItems)}
</tbody>
<tfoot>
  <tr>
    <td colspan="4" style="text-align: left;"><b>Загальна кількість:</b></td>
    <td><b>${totalTake.toFixed(2)}</b></td>
    <td colspan="2"></td>
  </tr>
</tfoot>
</table>

<div class="section-title">ВИДАТИ ЗІ СКЛАДУ</div>
<table>
<thead>
<tr>
  <th>№</th>
  <th>Група</th>
  <th>Номенклатура</th>
  <th>Од.</th>
  <th>К-ть</th>
  <th>Дата вигот.</th>
  <th>Кінцева дата</th>
</tr>
</thead>
<tbody>
${renderRows(giveItems)}
</tbody>
<tfoot>
  <tr>
    <td colspan="4" style="text-align: lefr;"><b>Загальна кількість:</b></td>
    <td><b>${totalGive.toFixed(2)}</b></td>
    <td colspan="2"></td>
  </tr>
</tfoot>
</table>

<div class="signatures">
  <div class="signatures-item">
    <p>Комірник</p> <p>____________________</p>
  </div>
  <div class="signatures-item"><p>Водій</p> <p>____________________</p></div>
  <div class="signatures-item"><p>Торгівельний <br>
  представник</p> <p>____________________</p></div>
  <div class="signatures-item"><p>Клієнт</p> <p>____________________</p></div>
</div>

</body>
</html>
`;
}
