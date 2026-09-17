function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanGuid(value) {
  return cleanText(value).toLowerCase() || null;
}

function duplicateValues(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

export function normalizeSalesAgentSnapshot(sourceRows) {
  const allRows = sourceRows.map((row, sourceIndex) => ({
    sourceIndex,
    login: cleanText(row?.login),
    routeGuid: cleanGuid(row?.routeGuid),
    routeName: cleanText(row?.routeName),
    fullName: cleanText(row?.currentAgent),
    currentAgentGuid: cleanGuid(row?.currentAgentGuid),
    supervisorName: cleanText(row?.supervisor),
    supervisorGuid: cleanGuid(row?.supervisorGuid),
    city: cleanText(row?.regionalDivision),
    regionalDivisionGuid: cleanGuid(row?.regionalDivisionGuid),
    assortmentName: cleanText(row?.assortment),
    assortmentGuid: cleanGuid(row?.assortmentGuid),
  }));

  const positions = allRows.filter((row) => row.login);
  const duplicateLogins = duplicateValues(positions, "login");
  const duplicateRouteGuids = duplicateValues(allRows, "routeGuid");

  if (duplicateLogins.length) {
    const error = new Error(`DUPLICATE_LOGIN: ${duplicateLogins.join(", ")}`);
    error.code = "DUPLICATE_LOGIN";
    throw error;
  }
  if (duplicateRouteGuids.length) {
    const error = new Error(`DUPLICATE_ROUTE_GUID: ${duplicateRouteGuids.join(", ")}`);
    error.code = "DUPLICATE_ROUTE_GUID";
    throw error;
  }

  return {
    total: allRows.length,
    ignoredNoLogin: allRows.length - positions.length,
    positions,
  };
}

export function buildSalesAgentImportPlan({ sourceRows, users, existingPositions = [] }) {
  const snapshot = normalizeSalesAgentSnapshot(sourceRows);
  const activeUsers = users.filter((user) => Number(user.is_active) === 1);
  const userByLogin = new Map(activeUsers.map((user) => [cleanText(user.NAME ?? user.name), user]));
  const existingByLogin = new Map(existingPositions.map((row) => [cleanText(row.login), row]));
  const anchors = [];
  const anchorByUserId = new Map();

  for (const position of snapshot.positions) {
    const user = userByLogin.get(position.login);
    if (!user) continue;
    const planned = { ...position, matchType: "ANCHOR", userId: Number(user.id) };
    anchors.push(planned);
    anchorByUserId.set(Number(user.id), planned);
  }

  const futureUsers = activeUsers.map((user) => {
    const anchor = anchorByUserId.get(Number(user.id));
    return {
      ...user,
      futureUserName: anchor ? anchor.fullName : user.user_name,
      futureCurrentAgentGuid: anchor
        ? anchor.currentAgentGuid
        : cleanGuid(user.current_agent_guid),
    };
  });

  const usersByFutureGuid = new Map();
  for (const user of futureUsers) {
    if (!user.futureCurrentAgentGuid) continue;
    const matches = usersByFutureGuid.get(user.futureCurrentAgentGuid) || [];
    matches.push(user);
    usersByFutureGuid.set(user.futureCurrentAgentGuid, matches);
  }

  const ambiguousAnchorGuids = [];
  for (const [guid, matchedUsers] of usersByFutureGuid) {
    const anchoredUsers = matchedUsers.filter((user) => anchorByUserId.has(Number(user.id)));
    if (anchoredUsers.length > 1) ambiguousAnchorGuids.push(guid);
  }
  if (ambiguousAnchorGuids.length) {
    const error = new Error(`AMBIGUOUS_ANCHOR_GUID: ${ambiguousAnchorGuids.join(", ")}`);
    error.code = "AMBIGUOUS_ANCHOR_GUID";
    throw error;
  }

  const conflicts = [];
  for (const user of futureUsers) {
    const anchor = anchorByUserId.get(Number(user.id));
    if (
      anchor &&
      cleanGuid(user.current_agent_guid) &&
      cleanGuid(user.current_agent_guid) !== anchor.currentAgentGuid
    ) {
      conflicts.push({
        type: "PERSON_REPLACED",
        userId: Number(user.id),
        login: anchor.login,
        previousGuid: cleanGuid(user.current_agent_guid),
        nextGuid: anchor.currentAgentGuid,
      });
    }
  }

  let secondary = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const positions = snapshot.positions.map((position) => {
    const anchorUser = userByLogin.get(position.login);
    let matchType;
    let userId = null;

    if (anchorUser) {
      matchType = "ANCHOR";
      userId = Number(anchorUser.id);
    } else {
      const matches = position.currentAgentGuid
        ? usersByFutureGuid.get(position.currentAgentGuid) || []
        : [];
      if (matches.length === 1) {
        matchType = "SECONDARY";
        userId = Number(matches[0].id);
        secondary += 1;
      } else if (matches.length > 1) {
        matchType = "AMBIGUOUS";
        ambiguous += 1;
      } else {
        matchType = "UNMATCHED";
        unmatched += 1;
      }
    }

    const existing = existingByLogin.get(position.login);
    if (existing?.user_id && Number(existing.user_id) !== Number(userId || 0)) {
      conflicts.push({
        type: "CROSS_USER_RELINK",
        login: position.login,
        previousUserId: Number(existing.user_id),
        nextUserId: userId,
      });
    }

    return { ...position, matchType, userId };
  });

  if (ambiguous) {
    const error = new Error("AMBIGUOUS_SECONDARY_GUID");
    error.code = "AMBIGUOUS_SECONDARY_GUID";
    error.plan = { positions, conflicts };
    throw error;
  }

  for (const user of futureUsers) {
    const anchor = anchorByUserId.get(Number(user.id));
    if (!anchor || !cleanGuid(user.current_agent_guid) || cleanGuid(user.current_agent_guid) === anchor.currentAgentGuid) {
      continue;
    }
    const oldGuidStillPresent = positions.some(
      (position) =>
        position.matchType !== "ANCHOR" &&
        position.currentAgentGuid === cleanGuid(user.current_agent_guid) &&
        Number(existingByLogin.get(position.login)?.user_id) === Number(user.id),
    );
    if (oldGuidStillPresent) {
      conflicts.push({
        type: "PARTIAL_PERSON_CHANGE",
        userId: Number(user.id),
        previousGuid: cleanGuid(user.current_agent_guid),
        nextGuid: anchor.currentAgentGuid,
      });
    }
  }

  return {
    stats: {
      total: snapshot.total,
      positions: positions.length,
      anchors: anchors.length,
      secondary,
      ignored_no_login: snapshot.ignoredNoLogin,
      unmatched,
      ambiguous,
    },
    positions,
    anchorUpdates: anchors.map((anchor) => ({
      userId: anchor.userId,
      userName: anchor.fullName,
      currentAgentGuid: anchor.currentAgentGuid,
    })),
    conflicts,
  };
}
