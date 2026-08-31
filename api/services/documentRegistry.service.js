import XLSX from "xlsx";
import { BadRequest, Forbidden, NotFound } from "../utils/Errors.js";
import { getDocumentByIdService } from "./DocumentService.js";

const MAX_DOCUMENTS = 250;
const ACCESS_CHECK_BATCH_SIZE = 8;

const STATUS_LABELS = Object.freeze({
  NEW: "Новий",
  PREPARED: "Погоджено",
  REVISION: "На доопрацювання",
  REJECTED: "Відхилено",
  SIGNED: "Підписано",
  NOT_COMPLETED: "Не виконано",
  PLANNED: "Заплановано",
  COMPLETED: "Виконано",
});

const DOCUMENT_TYPE_LABELS = Object.freeze({
  RETURN: "Повернення",
  EXCHANGE: "Обмін",
});

const TRO_MOVEMENT_LABELS = Object.freeze({
  INSTALL: "Установка",
  RETURN: "Повернення",
});

const TRO_COLUMNS = Object.freeze([
  { key: "branch", label: "Філія", width: 16 },
  { key: "number", label: "№ документа", width: 20 },
  { key: "date", label: "Дата", width: 12 },
  { key: "type", label: "Тип руху", width: 14 },
  { key: "contractor", label: "Контрагент", width: 30 },
  { key: "tradePoint", label: "Торгова точка", width: 34 },
  { key: "author", label: "Автор", width: 24 },
  { key: "ta", label: "ТА", width: 24 },
  { key: "troItems", label: "ТРО", width: 42 },
  { key: "troQuantities", label: "Кількість", width: 14 },
  { key: "status", label: "Статус", width: 20 },
  { key: "upNumber", label: "№ документа з УП", width: 20 },
  { key: "executor", label: "Виконавець", width: 26 },
  { key: "act", label: "Акт", width: 10 },
  { key: "photo", label: "Фото", width: 10 },
  { key: "specification", label: "Специфікація", width: 16 },
  { key: "comment", label: "Коментар", width: 36 },
]);

const RETURN_EXCHANGE_COLUMNS = Object.freeze([
  { key: "branch", label: "Філія", width: 16 },
  { key: "number", label: "№ документа", width: 20 },
  { key: "date", label: "Дата", width: 12 },
  { key: "type", label: "Тип", width: 14 },
  { key: "contractor", label: "Контрагент", width: 30 },
  { key: "tradePoint", label: "Торгова точка", width: 34 },
  { key: "author", label: "Автор", width: 24 },
  { key: "items", label: "Товари та кількість", width: 52 },
  { key: "status", label: "Статус", width: 20 },
  { key: "reason", label: "Причина", width: 28 },
  { key: "executor", label: "Виконавець", width: 16 },
  { key: "comment", label: "Коментар", width: 36 },
]);

function normalizeSelection(payload = {}) {
  const category = payload.category;
  if (!["tro", "return-exchange"].includes(category)) {
    throw new BadRequest("Невідома категорія документів");
  }

  if (!Array.isArray(payload.documentIds)) {
    throw new BadRequest("Потрібно передати список документів");
  }

  const documentIds = Array.from(
    new Set(
      payload.documentIds
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  );

  if (!documentIds.length) {
    throw new BadRequest("Не вибрано жодного документа");
  }
  if (documentIds.length > MAX_DOCUMENTS) {
    throw new BadRequest(`За один раз можна експортувати до ${MAX_DOCUMENTS} документів`);
  }

  return { category, documentIds };
}

function formatDate(value) {
  if (!value) return "";

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
}

function formatQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return String(value || "");
  return quantity.toLocaleString("uk-UA", { maximumFractionDigits: 3 });
}

function formatItems(items = []) {
  return items
    .map((item) => {
      const name = item.productName || item.product_name || "";
      const unit = item.unit ? ` ${item.unit}` : "";
      return `${name} — ${formatQuantity(item.quantity)}${unit}`.trim();
    })
    .filter(Boolean)
    .join("; ");
}

function formatTroItems(items = []) {
  return items
    .map((item) => item.productName || item.product_name || "")
    .filter(Boolean)
    .join("\n");
}

function formatTroQuantities(items = []) {
  return items
    .map((item) => formatQuantity(item.quantity))
    .join("\n");
}

function yesNo(value) {
  return value ? "Так" : "Ні";
}

function commonRow(doc) {
  const tradePoint = [doc.tradePoint?.name, doc.tradePoint?.address]
    .filter(Boolean)
    .join(" · ");

  return {
    branch: doc.branchShortName || doc.branchName || "",
    number: doc.documentNumber || "",
    date: formatDate(doc.documentDate),
    contractor: doc.contractor?.name || "",
    tradePoint,
    author: doc.author || "",
    items: formatItems(doc.items),
    status: STATUS_LABELS[doc.status] || doc.status || "",
    comment: doc.comment || "",
  };
}

function troRow(doc) {
  const tro = doc.tro || {};
  const isInstall = tro.movementType === "INSTALL";

  return {
    ...commonRow(doc),
    type: TRO_MOVEMENT_LABELS[tro.movementType] || tro.movementType || "",
    ta: tro.taName || "",
    troItems: formatTroItems(doc.items),
    troQuantities: formatTroQuantities(doc.items),
    upNumber: tro.upDocumentNumber || "",
    executor: tro.executorName || "",
    act: yesNo(isInstall ? tro.appInstall : tro.appReturn),
    photo: isInstall ? yesNo(tro.photoInstall) : "",
    specification: isInstall ? "" : yesNo(tro.warehouseSpecReturn),
  };
}

function returnExchangeRow(doc) {
  return {
    ...commonRow(doc),
    type: DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType || "",
    reason: doc.reason || "",
    executor: doc.executorType === "DRIVER" ? "Водій" : "ТА",
  };
}

async function loadAuthorizedDocument(user, documentId) {
  try {
    return await getDocumentByIdService(user, documentId);
  } catch (error) {
    if (error?.message === "FORBIDDEN") {
      throw new Forbidden(`Немає доступу до документа ${documentId}`);
    }
    if (error?.message === "NOT_FOUND") {
      throw new NotFound(`Документ ${documentId} не знайдено`);
    }
    throw error;
  }
}

export async function buildSelectedDocumentRegistry(user, payload) {
  const { category, documentIds } = normalizeSelection(payload);
  const documents = [];

  for (let offset = 0; offset < documentIds.length; offset += ACCESS_CHECK_BATCH_SIZE) {
    const batch = documentIds.slice(offset, offset + ACCESS_CHECK_BATCH_SIZE);
    documents.push(
      ...(await Promise.all(
        batch.map((documentId) => loadAuthorizedDocument(user, documentId)),
      )),
    );
  }

  const expectedTro = category === "tro";
  if (documents.some((doc) => (doc.documentType === "TRO") !== expectedTro)) {
    throw new BadRequest("Вибрані документи належать до різних розділів");
  }

  const columns = expectedTro ? TRO_COLUMNS : RETURN_EXCHANGE_COLUMNS;
  const rows = documents.map(expectedTro ? troRow : returnExchangeRow);

  return {
    category,
    title: expectedTro ? "Реєстр документів ТРО" : "Реєстр документів повернення / обміну",
    generatedAt: new Date().toISOString(),
    count: rows.length,
    columns,
    rows,
  };
}

export function createDocumentRegistryWorkbook(registry) {
  const values = [
    registry.columns.map((column) => column.label),
    ...registry.rows.map((row) =>
      registry.columns.map((column) => row[column.key] ?? ""),
    ),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(values);
  worksheet["!cols"] = registry.columns.map((column) => ({ wch: column.width }));
  worksheet["!rows"] = [
    { hpt: 20 },
    ...registry.rows.map((row) => {
      const lineCount = Math.max(
        String(row.troItems || "").split("\n").length,
        String(row.troQuantities || "").split("\n").length,
      );
      return { hpt: Math.max(18, lineCount * 15) };
    }),
  ];
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: values.length - 1, c: registry.columns.length - 1 }),
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Документи");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export function getDocumentRegistryFileName(registry) {
  const date = new Date().toISOString().slice(0, 10);
  const prefix = registry.category === "tro" ? "tro-documents" : "return-exchange-documents";
  return `${prefix}-${date}.xlsx`;
}
