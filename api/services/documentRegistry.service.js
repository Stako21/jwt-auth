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

const UNIT_LABELS = Object.freeze({
  PCS: "шт",
  KG: "кг",
  BOX: "ящ",
  BLOCK: "блок",
});

const ITEM_OPERATION_LABELS = Object.freeze({
  TAKE: "Забрати",
  GIVE: "Видати",
});

const TRO_DEFAULT_COLUMN_KEYS = new Set([
  "date",
  "contractor",
  "tradePoint",
  "ta",
  "troItem",
  "troQuantity",
  "status",
  "comment",
]);

const TRO_COLUMNS = Object.freeze([
  { key: "branch", label: "Філія", width: 16 },
  { key: "number", label: "№ документа", width: 20 },
  { key: "date", label: "Дата", width: 12 },
  { key: "type", label: "Тип руху", width: 14 },
  { key: "contractor", label: "Контрагент", width: 30 },
  { key: "tradePoint", label: "Торгова точка", width: 34 },
  { key: "author", label: "Автор", width: 24 },
  { key: "ta", label: "ТА", width: 24 },
  { key: "troItem", label: "ТРО", width: 42 },
  { key: "troQuantity", label: "Кількість", width: 14 },
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
  { key: "products", label: "Товар", width: 44 },
  { key: "productQuantities", label: "Кількість", width: 16 },
  { key: "status", label: "Статус", width: 20 },
  { key: "reason", label: "Причина", width: 28 },
  { key: "executor", label: "Виконавець", width: 16 },
  { key: "comment", label: "Коментар", width: 36 },
]);

function getCategoryColumns(category) {
  if (category === "tro") return TRO_COLUMNS;
  if (category === "return-exchange") return RETURN_EXCHANGE_COLUMNS;
  throw new BadRequest("Невідома категорія документів");
}

export function getDocumentRegistryColumnOptions(category) {
  const columns = getCategoryColumns(category);
  return {
    category,
    columns: columns.map((column) => ({
      key: column.key,
      label: column.label,
      defaultSelected: category === "tro"
        ? TRO_DEFAULT_COLUMN_KEYS.has(column.key)
        : true,
    })),
  };
}

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

  const availableColumns = getCategoryColumns(category);
  let columns = availableColumns;
  if (Array.isArray(payload.columnKeys)) {
    const requestedKeys = new Set(payload.columnKeys.map(String));
    columns = availableColumns.filter((column) => requestedKeys.has(column.key));
    if (!columns.length) {
      throw new BadRequest("Оберіть хоча б одну колонку реєстру");
    }
  }

  return { category, documentIds, columns };
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

function productName(item, includeOperation = false) {
  const name = item.productName || item.product_name || "";
  const operation = includeOperation ? ITEM_OPERATION_LABELS[item.operation] : "";
  return operation ? `${operation}: ${name}` : name;
}

function productQuantity(item) {
  const unit = item.unit ? ` ${UNIT_LABELS[item.unit] || item.unit}` : "";
  return `${formatQuantity(item.quantity)}${unit}`.trim();
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
    status: STATUS_LABELS[doc.status] || doc.status || "",
    comment: doc.comment || "",
  };
}

function troRows(doc) {
  const tro = doc.tro || {};
  const isInstall = tro.movementType === "INSTALL";

  const base = {
    ...commonRow(doc),
    type: TRO_MOVEMENT_LABELS[tro.movementType] || tro.movementType || "",
    ta: tro.taName || "",
    upNumber: tro.upDocumentNumber || "",
    executor: tro.executorName || "",
    act: yesNo(isInstall ? tro.appInstall : tro.appReturn),
    photo: isInstall ? yesNo(tro.photoInstall) : "",
    specification: isInstall ? "" : yesNo(tro.warehouseSpecReturn),
  };
  const items = doc.items?.length ? doc.items : [{}];
  return items.map((item, groupIndex) => ({
    ...base,
    troItem: productName(item),
    troQuantity: formatQuantity(item.quantity),
    _groupIndex: groupIndex,
    _groupSize: items.length,
  }));
}

function returnExchangeRows(doc) {
  const base = {
    ...commonRow(doc),
    type: DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType || "",
    reason: doc.reason || "",
    executor: doc.executorType === "DRIVER" ? "Водій" : "ТА",
  };
  const items = doc.items?.length ? doc.items : [{}];
  return items.map((item, groupIndex) => ({
    ...base,
    products: productName(item, doc.documentType === "EXCHANGE"),
    productQuantities: productQuantity(item),
    _groupIndex: groupIndex,
    _groupSize: items.length,
  }));
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
  const { category, documentIds, columns } = normalizeSelection(payload);
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

  const itemColumnKeys = expectedTro
    ? ["troItem", "troQuantity"]
    : ["products", "productQuantities"];
  const includeItemRows = columns.some((column) => itemColumnKeys.includes(column.key));
  const rows = documents.flatMap((document) => {
    const documentRows = (expectedTro ? troRows : returnExchangeRows)(document);
    return includeItemRows
      ? documentRows
      : [{ ...documentRows[0], _groupIndex: 0, _groupSize: 1 }];
  });

  return {
    category,
    title: expectedTro ? "Реєстр документів ТРО" : "Реєстр документів повернення / обміну",
    generatedAt: new Date().toISOString(),
    count: documents.length,
    rowCount: rows.length,
    columns,
    itemColumnKeys,
    rows,
  };
}

export function createDocumentRegistryWorkbook(registry) {
  const values = [
    registry.columns.map((column) => column.label),
    ...registry.rows.map((row) =>
      registry.columns.map((column) =>
        row._groupIndex > 0 && !registry.itemColumnKeys.includes(column.key)
          ? ""
          : row[column.key] ?? "",
      ),
    ),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(values);
  worksheet["!cols"] = registry.columns.map((column) => ({ wch: column.width }));
  worksheet["!rows"] = [{ hpt: 20 }, ...registry.rows.map(() => ({ hpt: 18 }))];
  worksheet["!merges"] = [];
  registry.rows.forEach((row, rowIndex) => {
    if (row._groupIndex !== 0 || row._groupSize < 2) return;
    registry.columns.forEach((column, columnIndex) => {
      if (registry.itemColumnKeys.includes(column.key)) return;
      worksheet["!merges"].push({
        s: { r: rowIndex + 1, c: columnIndex },
        e: { r: rowIndex + row._groupSize, c: columnIndex },
      });
    });
  });
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
