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

function normalizeQuantityCells(cells) {
  return cells.filter((value) => value !== null && value !== undefined && value !== "");
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

function buildHierarchy(rows, rowMeta, dataStartIndex) {
  const parsedRows = rows
    .slice(dataStartIndex)
    .map((cells, offset) => {
      const rowIndex = dataStartIndex + offset;
      const productNameCell =
        typeof cells?.[0] === "string" ? cells[0].trim() : String(cells?.[0] || "").trim();
      const productQuantityCell = normalizeQuantityCells(cells.slice(1));
      const baseLevel = Number.isInteger(rowMeta?.[rowIndex]?.level)
        ? Number(rowMeta[rowIndex].level)
        : 0;

      return {
        rowIndex,
        productNameCell,
        productQuantityCell,
        baseLevel,
      };
    })
    .filter((row) => row.productNameCell && row.productQuantityCell.length > 0);

  const rootNodes = [];
  const stack = [];

  parsedRows.forEach((row, index) => {
    const nextRow = parsedRows[index + 1] || null;
    const isGroupRow =
      isLikelyGroupName(row.productNameCell) &&
      Boolean(nextRow) &&
      nextRow.productNameCell !== "";
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

export function parseBalanceWorkbookData(data) {
  const workbook = XLSX.read(data, { type: "array", cellStyles: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  const rowMeta = sheet["!rows"] || [];

  const dataStartIndex = findDataStartIndex(rows);
  if (dataStartIndex === -1) {
    return {
      hierarchy: [],
      lastUpdateTime: extractLastUpdateTime(rows),
    };
  }

  return {
    hierarchy: buildHierarchy(rows, rowMeta, dataStartIndex),
    lastUpdateTime: extractLastUpdateTime(rows),
  };
}
