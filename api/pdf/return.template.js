import { formatPdfDate, formatPdfDateTime } from "./dateFormatters.js";

export function renderReturnHtml(doc, stampBase64) {
  const UNIT_LABELS = {
    PCS: "шт",
    KG: "кг",
    BOX: "ящ",
    BLOCK: "блок",
  };

  const STATUS_STAMP = {
    PREPARED: "stamps/PREPARED.png",
    SIGNED: "stamps/SIGNED.png",
    REJECTED: "stamps/REJECTED.png",
    REVISION: "stamps/REVISION.png",
  };

  function formatDateTime(date) {
    return formatPdfDateTime(date);
  }

  const stampImg = STATUS_STAMP[doc.status];

  function formatDate(date) {
    return formatPdfDate(date);
  }

  const rows = doc.items
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
      <td style="width: 180px;"></td>
    </tr>
  `,
    )
    .join("");

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
  top: 85px;
  right: 20px;
  width: 260px;
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
  opacity: 0.8;
  z-index: 1001;
}
h1 { text-align: center; font-size: 16px; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th, td { border: 1px solid #000; padding: 4px; font-size: 10px; }
th { background: #f0f0f0; }
.header { text-align: right; margin-bottom: 20px; }
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
        : doc.status === "PREPARED"
          ? "ПІДГОТОВЛЕНО"
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

<h1>Накладна на повернення ${doc.documentNumber} від ${formatDate(doc.documentDate)}</h1>

<p><b>Контрагент:</b> ${doc.contractor.name}</p>
<p><b>Торгівельна точка:</b> ${doc.tradePoint.name}</p>
<p><b>Адреса:</b> ${doc.tradePoint.address}</p>
<p><b>Через:</b> ${doc.author}</p>
<p><b>Причина повернення:</b> ${doc.reason}</p>

<table>
<thead>
<tr>
  <th>№</th>
  <th>Група</th>
  <th>Назва</th>
  <th>Од.</th>
  <th>К-ть</th>
  <th>Дата вигот.</th>
  <th>Кінцева дата</th>
  <th>№ РН</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
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
