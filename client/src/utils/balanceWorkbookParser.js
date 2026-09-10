import * as XLSX from "xlsx";

function extractLastUpdateTime(rows) {
  const periodRow = rows.find(
    (row) => typeof row?.[0] === "string" && row[0].trim().startsWith("Период:"),
  );

  const rawValue = String(periodRow?.[0] || "").trim();
  const match = rawValue.match(/^Период:\s*на\s*(.+)$/i);
  return match?.[1]?.trim() || "";
}

function findDataStartIndex(rows) {
  return rows.findIndex(
    (row, index) =>
      index > 0 &&
      typeof row?.[0] === "string" &&
      row[0].trim() &&
      row.slice(1).some((value) => typeof value === "number"),
  );
}

function hasLetters(value) {
  return /\p{L}/u.test(value);
}

function getLetterStats(value) {
  const letters = Array.from(value).filter((char) => /\p{L}/u.test(char));
  const uppercaseLetters = letters.filter((char) => char === char.toUpperCase());

  return {
    lettersCount: letters.length,
    uppercaseRatio: letters.length ? uppercaseLetters.length / letters.length : 0,
  };
}

function isLikelyProductName(value) {
  return /\/\d+|АКЦІЯ|ЦІНОВА|ОПТ|ВКФ|\b\d+г\b|\b\d+кг\b|\b\d+шт\b/i.test(value);
}

function isLikelyGroupName(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !hasLetters(normalized) || isLikelyProductName(normalized)) {
    return false;
  }

  const { lettersCount, uppercaseRatio } = getLetterStats(normalized);
  if (!lettersCount) {
    return false;
  }

  if (/^\d+(?:\.\d+)*\s+\S+/.test(normalized)) {
    return true;
  }

  return uppercaseRatio >= 0.85 && normalized.length <= 80;
}

function isHierarchyParent(row, nextRow) {
  if (!nextRow) return false;
  return nextRow.baseLevel > row.baseLevel || isLikelyGroupName(row.productNameCell);
}

function normalizeQuantityCells(cells) {
  return cells.filter((value) => value !== null && value !== undefined && value !== "");
}

function normalizeHeaderText(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function findMetricColumns(rows, dataStartIndex) {
  const headerRows = rows.slice(Math.max(0, dataStartIndex - 6), dataStartIndex);
  let priceColumnIndex = null;
  let quantityColumnIndexes = [];

  headerRows.forEach((row) => {
    row.forEach((cell, index) => {
      const normalized = normalizeHeaderText(cell);
      if (!normalized) return;

      if (/ц[іиі]?на|цена/.test(normalized)) {
        priceColumnIndex = index;
      }

      if (/остат|залиш|свобод/.test(normalized)) {
        quantityColumnIndexes.push(index);
      }
    });
  });

  quantityColumnIndexes = [...new Set(quantityColumnIndexes)].filter(
    (index) => index > 0 && index !== priceColumnIndex,
  );

  return {
    priceColumnIndex,
    quantityColumnIndexes,
  };
}

function getNumericCell(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPriceCell(cells, priceColumnIndex) {
  if (!priceColumnIndex) return null;
  return getNumericCell(cells[priceColumnIndex]);
}

function getQuantityCells(cells, quantityColumnIndexes, priceColumnIndex) {
  if (quantityColumnIndexes.length) {
    return normalizeQuantityCells(quantityColumnIndexes.map((index) => cells[index]));
  }

  return normalizeQuantityCells(
    cells.slice(1).filter((_, offset) => offset + 1 !== priceColumnIndex),
  );
}

function normalizePriceMultiplierPercent(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function applyPriceMultiplier(price, priceMultiplierPercent) {
  if (price === null || priceMultiplierPercent === null) return null;
  return price * (1 + priceMultiplierPercent / 100);
}

function getEffectiveLevel(baseLevel, isGroupRow, nextBaseLevel) {
  if (!isGroupRow) {
    return baseLevel;
  }

  if (nextBaseLevel !== null && nextBaseLevel <= baseLevel) {
    return Math.max(0, nextBaseLevel - 1);
  }

  return baseLevel;
}

function createNode(row) {
  return {
    productNameCell: row.productNameCell,
    productQuantityCell: row.productQuantityCell,
    priceCell: row.priceCell,
    adjustedPriceCell: row.adjustedPriceCell,
    priceMultiplierPercent: row.priceMultiplierPercent,
    configuredValues: row.configuredValues || null,
    children: [],
  };
}

function isTopLevelWrapperName(value) {
  return /ТОВАР/i.test(String(value || ""));
}

function attachNode(rootNodes, stack, row) {
  while (stack.length && stack[stack.length - 1].level >= row.level) {
    stack.pop();
  }

  const node = createNode(row);
  const parent = stack[stack.length - 1];

  if (parent) {
    parent.node.children.push(node);
  } else {
    rootNodes.push(node);
  }

  if (row.isGroupRow) {
    stack.push({ level: row.level, node });
  }
}

function buildHierarchy(rows, rowMeta, dataStartIndex, options = {}) {
  const priceMultiplierPercent = normalizePriceMultiplierPercent(
    options.priceMultiplierPercent,
  );
  const { priceColumnIndex, quantityColumnIndexes } = findMetricColumns(
    rows,
    dataStartIndex,
  );
  const parsedRows = rows
    .slice(dataStartIndex)
    .map((cells, offset) => {
      const rowIndex = dataStartIndex + offset;
      const productNameCell =
        typeof cells?.[0] === "string" ? cells[0].trim() : String(cells?.[0] || "").trim();
      const priceCell = getPriceCell(cells, priceColumnIndex);
      const productQuantityCell = getQuantityCells(
        cells,
        quantityColumnIndexes,
        priceColumnIndex,
      );
      const baseLevel = Number.isInteger(rowMeta?.[rowIndex]?.level)
        ? Number(rowMeta[rowIndex].level)
        : 0;

      return {
        rowIndex,
        productNameCell,
        productQuantityCell,
        priceCell,
        adjustedPriceCell: applyPriceMultiplier(priceCell, priceMultiplierPercent),
        priceMultiplierPercent,
        baseLevel,
      };
    })
    .filter((row) => row.productNameCell && row.productQuantityCell.length > 0);

  const rootNodes = [];
  const stack = [];

  parsedRows.forEach((row, index) => {
    const nextRow = parsedRows[index + 1] || null;
    const isGroupRow = isHierarchyParent(row, nextRow);
    const effectiveLevel = getEffectiveLevel(
      row.baseLevel,
      isGroupRow,
      nextRow ? nextRow.baseLevel : null,
    );

    attachNode(rootNodes, stack, {
      ...row,
      level: effectiveLevel,
      isGroupRow,
    });
  });

  const wrapperIndex = rootNodes.findIndex((node) =>
    isTopLevelWrapperName(node.productNameCell),
  );

  if (wrapperIndex === -1) {
    return rootNodes;
  }

  const result = rootNodes.slice(0, wrapperIndex);
  const wrapperNode = {
    ...rootNodes[wrapperIndex],
    children: [...rootNodes[wrapperIndex].children],
  };

  for (const node of rootNodes.slice(wrapperIndex + 1)) {
    if (isLikelyGroupName(node.productNameCell)) {
      wrapperNode.children.push(node);
      continue;
    }

    result.push(node);
  }

  result.push(wrapperNode);
  return result;
}

function parseColumnConfig(rawConfig) {
  if (!rawConfig) return null;
  if (typeof rawConfig === "string") {
    try {
      return JSON.parse(rawConfig);
    } catch {
      throw new Error("Налаштування колонок залишків містить некоректний JSON");
    }
  }
  return rawConfig;
}

function getMergedCellValue(rows, merges, rowIndex, columnIndex) {
  const merge = merges.find(({ s, e }) =>
    rowIndex >= s.r && rowIndex <= e.r &&
    columnIndex >= s.c && columnIndex <= e.c);
  const sourceRow = merge ? merge.s.r : rowIndex;
  const sourceColumn = merge ? merge.s.c : columnIndex;
  return rows[sourceRow]?.[sourceColumn] ?? null;
}

function getCompositeHeader(rows, merges, headerRow, headerEndRow, sourceIndex) {
  const parts = [];
  for (let rowIndex = headerRow - 1; rowIndex < headerEndRow; rowIndex += 1) {
    const part = String(getMergedCellValue(rows, merges, rowIndex, sourceIndex) ?? "").trim();
    if (part && !parts.some((existing) =>
      normalizeHeaderText(existing) === normalizeHeaderText(part))) {
      parts.push(part);
    }
  }
  return parts.join(" / ");
}

function buildConfiguredHierarchy(rows, rowMeta, merges, columnOffset, options) {
  const columnConfig = parseColumnConfig(options.columnConfig);
  const headerRow = Number(options.headerRow);
  const headerEndRow = Number(options.headerEndRow ?? options.headerRow);
  const dataStartRow = Number(options.dataStartRow);
  if (!columnConfig?.columns?.length || !Number.isInteger(headerRow) ||
    !Number.isInteger(headerEndRow) || !Number.isInteger(dataStartRow) ||
    headerRow < 1 || headerEndRow < headerRow || dataStartRow <= headerEndRow) {
    throw new Error("Налаштування структури XLSX неповне. Перевірте сторінку залишків в адмініструванні");
  }

  const columns = columnConfig.columns.map((column) => {
    const actualHeader = getCompositeHeader(
      rows,
      merges,
      headerRow,
      headerEndRow,
      Number(column.sourceIndex),
    );
    const expectedHeader = String(column.sourceHeader || "").trim();
    if (normalizeHeaderText(actualHeader) !== normalizeHeaderText(expectedHeader)) {
      const columnLetter = XLSX.utils.encode_col(Number(column.sourceIndex) + columnOffset);
      throw new Error(
        `Структура XLSX не відповідає налаштуванню: колонка ${columnLetter} ` +
        `мала заголовок «${expectedHeader}», зараз «${actualHeader || "порожньо"}». ` +
        "Оновіть налаштування сторінки залишків",
      );
    }
    return {
      ...column,
      isPrice: column.id === columnConfig.priceColumnId,
    };
  });
  const hierarchyColumn = columns.find((column) => column.role === "hierarchy");
  if (!hierarchyColumn) {
    throw new Error("У налаштуванні не вибрано колонку номенклатури та ієрархії");
  }

  const priceMultiplierPercent = normalizePriceMultiplierPercent(
    options.priceMultiplierPercent,
  );
  const parsedRows = rows
    .slice(dataStartRow - 1)
    .map((cells, offset) => {
      const rowIndex = dataStartRow - 1 + offset;
      const productNameCell = String(cells?.[hierarchyColumn.sourceIndex] ?? "").trim();
      const configuredValues = Object.fromEntries(columns.map((column) => {
        const rawValue = cells?.[column.sourceIndex] ?? null;
        const value = column.isPrice && typeof rawValue === "number"
          ? applyPriceMultiplier(rawValue, priceMultiplierPercent)
          : rawValue;
        return [column.id, value];
      }));
      const priceColumn = columns.find((column) => column.isPrice);
      const priceCell = priceColumn
        ? getNumericCell(cells?.[priceColumn.sourceIndex])
        : null;
      const numericValues = columns
        .filter((column) => column.role !== "hierarchy" && !column.isPrice)
        .map((column) => configuredValues[column.id])
        .filter((value) => typeof value === "number" && Number.isFinite(value));
      const baseLevel = Number.isInteger(rowMeta?.[rowIndex]?.level)
        ? Number(rowMeta[rowIndex].level)
        : 0;

      return {
        rowIndex,
        productNameCell,
        productQuantityCell: numericValues,
        priceCell,
        adjustedPriceCell: applyPriceMultiplier(priceCell, priceMultiplierPercent),
        priceMultiplierPercent,
        configuredValues,
        baseLevel,
      };
    })
    .filter((row) => row.productNameCell);

  const rootNodes = [];
  const stack = [];
  parsedRows.forEach((row, index) => {
    const nextRow = parsedRows[index + 1] || null;
    const isGroupRow = isHierarchyParent(row, nextRow);
    const effectiveLevel = getEffectiveLevel(
      row.baseLevel,
      isGroupRow,
      nextRow ? nextRow.baseLevel : null,
    );
    attachNode(rootNodes, stack, { ...row, level: effectiveLevel, isGroupRow });
  });

  const wrapperIndex = rootNodes.findIndex((node) =>
    isTopLevelWrapperName(node.productNameCell),
  );
  if (wrapperIndex === -1) return { hierarchy: rootNodes, columns };

  const hierarchy = rootNodes.slice(0, wrapperIndex);
  const wrapperNode = {
    ...rootNodes[wrapperIndex],
    children: [...rootNodes[wrapperIndex].children],
  };
  for (const node of rootNodes.slice(wrapperIndex + 1)) {
    if (isLikelyGroupName(node.productNameCell)) wrapperNode.children.push(node);
    else hierarchy.push(node);
  }
  hierarchy.push(wrapperNode);
  return { hierarchy, columns };
}

export function parseBalanceWorkbookData(data, options = {}) {
  const workbook = XLSX.read(data, { type: "array", cellStyles: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sheetRange = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const columnOffset = sheetRange.s.c;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
    range: { s: { r: 0, c: columnOffset }, e: sheetRange.e },
  });
  const rowMeta = sheet["!rows"] || [];
  const merges = (sheet["!merges"] || []).map(({ s, e }) => ({
    s: { r: s.r, c: s.c - columnOffset },
    e: { r: e.r, c: e.c - columnOffset },
  }));

  const configured = Boolean(options.columnConfig);
  const dataStartIndex = configured
    ? Number(options.dataStartRow) - 1
    : findDataStartIndex(rows);
  if (dataStartIndex === -1) {
    return {
      hierarchy: [],
      lastUpdateTime: extractLastUpdateTime(rows),
      columns: [],
    };
  }

  if (configured) {
    const result = buildConfiguredHierarchy(rows, rowMeta, merges, columnOffset, options);
    return {
      ...result,
      lastUpdateTime: extractLastUpdateTime(rows),
    };
  }

  return {
    hierarchy: buildHierarchy(rows, rowMeta, dataStartIndex, options),
    lastUpdateTime: extractLastUpdateTime(rows),
    columns: null,
  };
}
