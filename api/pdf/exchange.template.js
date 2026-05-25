import { formatPdfDate, formatPdfDateTime } from "./dateFormatters.js";

export function renderExchangeHtml(doc, stampBase64) {
  const takeItems = doc.items.filter((i) => i.operation === "TAKE");
  const giveItems = doc.items.filter((i) => i.operation === "GIVE");
  const executorLabel = doc.executorType === "DRIVER" ? "ВОДІЙ" : "ТА";

  const STATUS_STAMP = {
    PREPARED: "stamps/PREPARED.png",
    SIGNED: "stamps/SIGNED.png",
    REJECTED: "stamps/REJECTED.png",
    REVISION: "stamps/REVISION.png",
  };

  const UNIT_LABELS = {
    PCS: "шт",
    KG: "кг",
    BOX: "ящ",
    BLOCK: "блок",
  };

  function formatDateTime(date) {
    return formatPdfDateTime(date);
  }

  function formatDate(date) {
    return formatPdfDate(date);
  }

  const stampImg = STATUS_STAMP[doc.status];

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
  opacity: 0.5;
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
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.meta-row p {
  margin: 0 0 12px;
}
.meta-right {
  margin-left: auto;
  text-align: right;
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
.signatures {
  margin-top: 40px;
  width: 210px;
}
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
    <div><b>${
      doc.status === "SIGNED"
        ? "ПІДПИСАНО"
        : doc.status === "PREPARED"
          ? "ПІДГОТОВЛЕНО"
          : doc.status === "REJECTED"
            ? "ВІДХИЛЕНО"
            : doc.status === "REVISION"
              ? "ВИПРАВИТИ"
              : ""
    }</b></div>
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
<div class="meta-row">
  <p><b>Через:</b> ${doc.author}</p>
  <p class="meta-right"><b>Виконавець:</b> ${executorLabel}</p>
</div>
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
    <td colspan="4" style="text-align: left;"><b>Загальна кількість:</b></td>
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
  <div class="signatures-item"><p>Торгівельний <br>представник</p> <p>____________________</p></div>
  <div class="signatures-item"><p>Клієнт</p> <p>____________________</p></div>
</div>

</body>
</html>
`;
}
