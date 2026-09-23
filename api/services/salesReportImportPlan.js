const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SalesReportImportError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = "SalesReportImportError";
    this.code = code;
    this.details = details;
  }
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeGuid(value, field, sourceIndex) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    throw new SalesReportImportError(
      "INVALID_SOURCE_ROW",
      `${field} must be a valid UUID`,
      { sourceIndex, field, value },
    );
  }
  return normalized;
}

function normalizeAgentLogins(value, sourceIndex) {
  if (!Array.isArray(value)) {
    throw new SalesReportImportError(
      "INVALID_SOURCE_ROW",
      "agentLogins must be an array",
      { sourceIndex, field: "agentLogins" },
    );
  }

  const normalized = [];
  const seen = new Set();
  for (const rawLogin of value) {
    if (typeof rawLogin !== "string") {
      throw new SalesReportImportError(
        "INVALID_SOURCE_ROW",
        "agentLogins items must be strings",
        { sourceIndex, field: "agentLogins", value: rawLogin },
      );
    }
    const login = rawLogin.trim();
    if (!login || seen.has(login)) continue;
    seen.add(login);
    normalized.push(login);
  }
  return normalized;
}

function normalizeDate(value, sourceIndex) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new SalesReportImportError(
      "INVALID_SOURCE_ROW",
      "date must be a valid date",
      { sourceIndex, field: "date", value },
    );
  }
  return {
    originalDate: value,
    docDate: parsed.toISOString().slice(0, 10),
  };
}

export function normalizeSalesReportSource(sourceRows, { minAllowedReportDate } = {}) {
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) {
    throw new SalesReportImportError(
      "EMPTY_SOURCE",
      "Sales report source must be a non-empty array",
    );
  }

  const rows = sourceRows.map((source, sourceIndex) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new SalesReportImportError(
        "INVALID_SOURCE_ROW",
        "Sales report row must be an object",
        { sourceIndex },
      );
    }

    const number = cleanText(source.number);
    if (!number) {
      throw new SalesReportImportError(
        "INVALID_SOURCE_ROW",
        "number is required",
        { sourceIndex, field: "number" },
      );
    }

    const documentGuid = normalizeGuid(source.DocumentGuid, "DocumentGuid", sourceIndex);
    const salesAgentGuid = normalizeGuid(
      source.salesAgentGuid,
      "salesAgentGuid",
      sourceIndex,
    );
    const agentLogins = normalizeAgentLogins(source.agentLogins, sourceIndex);
    const { originalDate, docDate } = normalizeDate(source.date, sourceIndex);

    return {
      sourceIndex,
      documentGuid,
      salesAgentGuid,
      agentLogins,
      number,
      originalDate,
      docDate,
      salesAgent: cleanText(source.salesAgent),
      amount: source.amount,
      pointOfSale: source.pointOfSale,
      customer: source.customer,
      comment: source.comment,
      form2: Boolean(source.form2),
      isDeleted: Boolean(source.isDeleted),
      outOfRange: Boolean(minAllowedReportDate && docDate < minAllowedReportDate),
    };
  });

  const guidCounts = new Map();
  for (const row of rows) {
    guidCounts.set(row.documentGuid, (guidCounts.get(row.documentGuid) || 0) + 1);
  }
  const duplicates = [...guidCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([documentGuid, count]) => ({ documentGuid, count }));

  if (duplicates.length) {
    throw new SalesReportImportError(
      "DUPLICATE_DOCUMENT_GUID_IN_SOURCE",
      "Source contains duplicate DocumentGuid values",
      { duplicates },
    );
  }

  return {
    rows,
    includedRows: rows.filter((row) => !row.outOfRange),
    rowsTotal: rows.length,
    skippedOutOfRangeRows: rows.filter((row) => row.outOfRange).length,
  };
}

function uniqueUsers(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    const id = Number(row?.id ?? row?.user_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        loginAgent: cleanText(row.NAME ?? row.loginAgent ?? row.user_login),
        salesAgentName: cleanText(row.user_name ?? row.salesAgentName),
      });
    }
  }
  return [...byId.values()];
}

export function resolveSalesReportUser(row, { usersByGuid, agentsByLogin }) {
  const guidUsers = uniqueUsers(usersByGuid.get(row.salesAgentGuid) || []);
  const loginMatches = row.agentLogins.flatMap(
    (login) => agentsByLogin.get(login) || [],
  );
  const loginUsers = uniqueUsers(loginMatches);

  if (loginUsers.length > 1) {
    return {
      errorCode: "AGENT_LOGINS_MULTI_USER_CONFLICT",
      guidUsers,
      loginUsers,
    };
  }

  if (guidUsers.length > 1) {
    return {
      errorCode: "AGENT_MAPPING_CONFLICT",
      reason: "salesAgentGuid resolves to multiple portal users",
      guidUsers,
      loginUsers,
    };
  }

  const guidUser = guidUsers[0] || null;
  const loginUser = loginUsers[0] || null;
  if (guidUser && loginUser && guidUser.id !== loginUser.id) {
    return {
      errorCode: "AGENT_MAPPING_CONFLICT",
      guidUsers,
      loginUsers,
    };
  }

  if (guidUser && loginUser) {
    return { user: guidUser, resolution: "RESOLVED_BY_GUID_AND_LOGIN" };
  }
  if (guidUser) {
    return { user: guidUser, resolution: "RESOLVED_BY_AGENT_GUID" };
  }
  if (loginUser) {
    return { user: loginUser, resolution: "RESOLVED_BY_AGENT_LOGIN" };
  }
  return { user: null, resolution: "UNRESOLVED_AGENT" };
}

function createdAtValue(row) {
  const value = new Date(row?.created_at || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function selectExistingGuidRow(rows) {
  const activeRows = rows.filter((row) => row.status === "ACTIVE");
  if (activeRows.length > 1) {
    return { errorCode: "DUPLICATE_ACTIVE_DOCUMENT_GUID" };
  }
  if (activeRows.length === 1) return { row: activeRows[0] };

  const ordered = [...rows].sort((a, b) => {
    const rank = { CANCELLED: 1, MOVED: 2 };
    const statusDiff = (rank[a.status] || 3) - (rank[b.status] || 3);
    return statusDiff || createdAtValue(b) - createdAtValue(a);
  });
  return { row: ordered[0] || null };
}

function selectLegacyRow(rows, user) {
  const candidates = rows.filter((row) => !row.document_guid);
  const canonical = candidates.filter(
    (row) => cleanText(row.login_agent) === user.loginAgent,
  );
  const canonicalActive = canonical.filter((row) => row.status === "ACTIVE");
  if (canonicalActive.length === 1) return { row: canonicalActive[0] };
  if (canonicalActive.length > 1) {
    return { errorCode: "LEGACY_BACKFILL_AMBIGUOUS" };
  }
  if (canonical.length === 1) return { row: canonical[0] };
  if (canonical.length > 1) return { errorCode: "LEGACY_BACKFILL_AMBIGUOUS" };

  const sameUser = candidates.filter(
    (row) => Number(row.user_id) === Number(user.id),
  );
  const sameUserActive = sameUser.filter((row) => row.status === "ACTIVE");
  if (sameUserActive.length === 1) return { row: sameUserActive[0] };
  if (sameUserActive.length > 1) {
    return { errorCode: "LEGACY_BACKFILL_AMBIGUOUS" };
  }
  if (sameUser.length === 1) return { row: sameUser[0] };
  if (sameUser.length > 1) return { errorCode: "LEGACY_BACKFILL_AMBIGUOUS" };
  return { row: null };
}

function initialCounters(snapshot) {
  return {
    rows_total: snapshot.rowsTotal,
    documents_total: snapshot.rowsTotal,
    documents_in_window: snapshot.includedRows.length,
    skipped_out_of_range: snapshot.skippedOutOfRangeRows,
    resolved_by_guid_and_login: 0,
    resolved_by_agent_guid: 0,
    resolved_by_agent_login: 0,
    existing_document_agent_not_current: 0,
    legacy_backfilled: 0,
    new_insert: 0,
    updated: 0,
    cancelled: 0,
    duplicate_source_guid: 0,
    unresolved: 0,
    agent_mapping_conflict: 0,
    agent_logins_multi_user_conflict: 0,
    document_user_change: 0,
    legacy_backfill_ambiguous: 0,
  };
}

function incrementResolution(counters, resolution) {
  const field = {
    RESOLVED_BY_GUID_AND_LOGIN: "resolved_by_guid_and_login",
    RESOLVED_BY_AGENT_GUID: "resolved_by_agent_guid",
    RESOLVED_BY_AGENT_LOGIN: "resolved_by_agent_login",
  }[resolution];
  if (field) counters[field] += 1;
}

export function buildSalesReportImportPlan({
  snapshot,
  usersByGuid = new Map(),
  agentsByLogin = new Map(),
  existingByGuid = new Map(),
  legacyByNumber = new Map(),
}) {
  const counters = initialCounters(snapshot);
  const actions = [];
  const diagnostics = [];
  const hardConflicts = [];

  for (const row of snapshot.includedRows) {
    const existingSelection = selectExistingGuidRow(
      existingByGuid.get(row.documentGuid) || [],
    );
    if (existingSelection.errorCode) {
      hardConflicts.push({
        code: existingSelection.errorCode,
        documentGuid: row.documentGuid,
        documentNumber: row.number,
      });
      continue;
    }
    const existing = existingSelection.row;
    const resolution = resolveSalesReportUser(row, { usersByGuid, agentsByLogin });

    if (resolution.errorCode) {
      const counter = resolution.errorCode === "AGENT_LOGINS_MULTI_USER_CONFLICT"
        ? "agent_logins_multi_user_conflict"
        : "agent_mapping_conflict";
      counters[counter] += 1;
      hardConflicts.push({
        code: resolution.errorCode,
        documentGuid: row.documentGuid,
        documentNumber: row.number,
        guidUserIds: resolution.guidUsers?.map((user) => user.id) || [],
        loginUserIds: resolution.loginUsers?.map((user) => user.id) || [],
      });
      continue;
    }

    incrementResolution(counters, resolution.resolution);
    let user = resolution.user;

    if (existing) {
      if (!user) {
        if (existing.user_id && cleanText(existing.login_agent)) {
          user = {
            id: Number(existing.user_id),
            loginAgent: cleanText(existing.login_agent),
            salesAgentName: cleanText(existing.sales_agent_name),
          };
          counters.existing_document_agent_not_current += 1;
          diagnostics.push({
            code: "EXISTING_DOCUMENT_AGENT_NOT_CURRENT",
            documentGuid: row.documentGuid,
            documentNumber: row.number,
            userId: user.id,
          });
        } else {
          counters.unresolved += 1;
          hardConflicts.push({
            code: "UNRESOLVED_AGENT",
            documentGuid: row.documentGuid,
            documentNumber: row.number,
          });
          continue;
        }
      } else if (existing.user_id && Number(existing.user_id) !== Number(user.id)) {
        counters.document_user_change += 1;
        hardConflicts.push({
          code: "DOCUMENT_USER_CHANGE",
          documentGuid: row.documentGuid,
          documentNumber: row.number,
          existingUserId: Number(existing.user_id),
          sourceUserId: Number(user.id),
        });
        continue;
      }

      counters.updated += 1;
      if (row.isDeleted) counters.cancelled += 1;
      actions.push({ type: "UPDATE_EXISTING", row, user, existing });
      continue;
    }

    if (!user) {
      counters.unresolved += 1;
      diagnostics.push({
        code: "UNRESOLVED_AGENT",
        documentGuid: row.documentGuid,
        documentNumber: row.number,
        salesAgentGuid: row.salesAgentGuid,
        salesAgentName: row.salesAgent,
        agentLogins: row.agentLogins,
      });
      continue;
    }

    const legacySelection = selectLegacyRow(
      legacyByNumber.get(row.number) || [],
      user,
    );
    if (legacySelection.errorCode) {
      counters.legacy_backfill_ambiguous += 1;
      hardConflicts.push({
        code: legacySelection.errorCode,
        documentGuid: row.documentGuid,
        documentNumber: row.number,
      });
      continue;
    }

    if (legacySelection.row) {
      counters.legacy_backfilled += 1;
      counters.updated += 1;
      if (row.isDeleted) counters.cancelled += 1;
      actions.push({
        type: "BACKFILL_LEGACY",
        row,
        user,
        existing: legacySelection.row,
      });
      continue;
    }

    counters.new_insert += 1;
    if (row.isDeleted) counters.cancelled += 1;
    actions.push({ type: "INSERT_NEW", row, user, existing: null });
  }

  return {
    actions,
    counters,
    diagnostics,
    hardConflicts,
    hasHardConflicts: hardConflicts.length > 0,
  };
}
