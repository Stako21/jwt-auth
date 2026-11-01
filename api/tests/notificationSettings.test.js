import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_GROUPS, LEGACY_TRO_EVENTS, TRO_EVENTS, normalizeNotificationSettings,
  normalizeNotificationDestination, readNotificationPolicy, selectNotificationRecipients, inferTroEvent,
} from "../services/notificationPolicy.js";
import { createRegionNotificationsService, createNotificationTestService } from "../services/regionNotifications.service.js";
import { loadNotificationRecipients } from "../services/notificationRecipients.service.js";
import { createTroNotificationSender } from "../services/notify.service.js";
import { createNotificationRetryService } from "../services/notificationRetry.service.js";
import { up } from "../migrations/032_notification_event_settings.js";

const USER = { id: 10, role: 1, branchId: 2, userName: "admin-test" };
const SETTINGS = { city: 7, email: "TEST@example.com", rocket_channel: "ops", is_active: true, document_groups: ["RETURN_EXCHANGE", "TRO"], tro_events: [...LEGACY_TRO_EVENTS] };
const getCity = async (id) => ({ id, branchId: id === 99 ? 3 : 2, name: "Місто" });
const getBranch = async () => ({ name: "Філія" });

test("settings normalize destinations and independently preserve both document groups and all seven events", () => {
  const values = normalizeNotificationSettings(SETTINGS);
  assert.equal(values.email, "test@example.com");
  assert.equal(values.rocket_channel, "#ops");
  assert.deepEqual(values.document_groups, LEGACY_GROUPS);
  assert.equal(TRO_EVENTS.length, 7);
  for (const payload of [
    { ...SETTINGS, document_groups: [] }, { ...SETTINGS, tro_events: [] },
    { ...SETTINGS, document_groups: ["RETURN"] }, { ...SETTINGS, tro_events: ["CANCELLED"] },
    { ...SETTINGS, email: "bad", rocket_channel: "" }, { ...SETTINGS, rocket_channel: "ops?token=secret" },
    { ...SETTINGS, email: "", rocket_channel: "" }, { ...SETTINGS, is_active: "false" },
  ]) assert.throws(() => normalizeNotificationSettings(payload), (error) => error.status === 422);
  assert.equal(normalizeNotificationSettings({ ...SETTINGS, is_active: false, document_groups: [], tro_events: [] }).is_active, false);
  assert.throws(() => normalizeNotificationDestination(null), (error) => error.status === 422);
});

test("each TRO event is filtered before recipient deduplication, independently of other rows", () => {
  for (const event of TRO_EVENTS) {
    const rows = [
      { ...SETTINGS, email: "same@example.com", tro_events: [] },
      { ...SETTINGS, email: " SAME@example.com ", tro_events: [event.value] },
      { ...SETTINGS, email: "same@example.com", rocket_channel: "#ops", tro_events: [event.value] },
      { ...SETTINGS, email: "off@example.com", is_active: 0, tro_events: [event.value] },
      { ...SETTINGS, email: "other@example.com", document_groups: ["RETURN_EXCHANGE"], tro_events: [event.value] },
    ];
    assert.deepEqual(selectNotificationRecipients(rows, { documentType: "TRO", eventCode: event.value }), {
      emails: ["same@example.com"], rocketChannels: ["#ops"],
    });
    const otherEvent = TRO_EVENTS.find((item) => item.value !== event.value).value;
    assert.deepEqual(selectNotificationRecipients([rows[1]], { documentType: "TRO", eventCode: otherEvent }), { emails: [], rocketChannels: [] });
  }
});

test("one return/exchange group controls both PDF types while TRO and malformed stored policy stay isolated", () => {
  const rows = [{ ...SETTINGS, document_groups: ["RETURN_EXCHANGE"], tro_events: [] }];
  for (const documentType of ["RETURN", "EXCHANGE"]) {
    assert.deepEqual(selectNotificationRecipients(rows, { documentType }).emails, ["test@example.com"]);
  }
  assert.equal(selectNotificationRecipients(rows, { documentType: "TRO", eventCode: "TRO_SIGNED" }).emails.length, 0);
  assert.deepEqual(readNotificationPolicy({ document_groups: "broken", tro_events: "{}" }), { document_groups: [], tro_events: [] });
  assert.deepEqual(readNotificationPolicy({}), { document_groups: LEGACY_GROUPS, tro_events: LEGACY_TRO_EVENTS });
});

test("recipient queries retain branch and city scope and preserve legacy sends before migration", async () => {
  const calls = [];
  const db = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("document_groups")) throw Object.assign(new Error(), { code: "ER_BAD_FIELD_ERROR" });
    return [[{ email: "legacy@example.com", rocket_channel: null }]];
  } };
  assert.deepEqual((await loadNotificationRecipients(7, 2, { documentType: "TRO", eventCode: "TRO_SIGNED" }, db)).emails, ["legacy@example.com"]);
  assert.deepEqual((await loadNotificationRecipients(7, 2, { documentType: "TRO", eventCode: "TRO_CREATED" }, db)).emails, []);
  assert.ok(calls.every(({ sql, params }) => /city = \? AND branch_id = \? AND is_active = 1/.test(sql) && params[0] === 7 && params[1] === 2));
});

test("CRUD validates management rights, current branch city and branch-scoped updates/deletes", async () => {
  const queries = [];
  const service = createRegionNotificationsService({ getCity, db: { async query(sql, params) { queries.push({ sql, params }); return [{ affectedRows: 1 }]; } } });
  await assert.rejects(service.save({ ...USER, role: 5 }, SETTINGS), (error) => error.status === 403);
  await assert.rejects(service.save(USER, { ...SETTINGS, city: 99 }), (error) => error.status === 403);
  assert.equal(queries.length, 0);
  await service.save(USER, SETTINGS, 12);
  assert.match(queries[0].sql, /WHERE id = \? AND branch_id = \?/);
  assert.deepEqual(queries[0].params.slice(-2), [12, 2]);
  await service.remove(USER, 12);
  assert.deepEqual(queries[1].params, [12, 2]);
});

test("migration backfills only NULL policies, preserves existing choices and is idempotent", async () => {
  const columns = new Set();
  const rows = [{ document_groups: null, tro_events: null }, { document_groups: "[]", tro_events: "[]" }];
  const db = { async query(sql, params = []) {
    if (sql.includes("information_schema.columns")) return [columns.has(params[0]) ? [{}] : []];
    if (sql.startsWith("ALTER TABLE")) { columns.add(sql.includes("document_groups") ? "document_groups" : "tro_events"); return [{}]; }
    const column = sql.includes("SET document_groups") ? "document_groups" : "tro_events";
    assert.match(sql, /WHERE \w+ IS NULL/);
    rows.forEach((row) => { if (row[column] === null) row[column] = params[0]; });
    return [{}];
  } };
  await up(db);
  const first = structuredClone(rows);
  await up(db);
  assert.deepEqual(rows, first);
  assert.deepEqual(JSON.parse(rows[0].document_groups), LEGACY_GROUPS);
  assert.deepEqual(JSON.parse(rows[0].tro_events), LEGACY_TRO_EVENTS);
  assert.equal(rows[1].document_groups, "[]");
  assert.equal(JSON.parse(rows[0].tro_events).includes("TRO_CREATED"), false);
});

function testService(overrides = {}) {
  const calls = [], logs = [];
  const send = createNotificationTestService({ getCity, getBranch, now: () => 0,
    sendEmail: async (message) => calls.push({ channel: "email", ...message }),
    sendRocket: async (channel, text) => calls.push({ channel: "rocket", target: channel, text }),
    logger: (entry) => logs.push(entry), ...overrides });
  return { send, calls, logs };
}

test("unsaved test destinations use both real-transport interfaces with safe per-channel results", async () => {
  const { send, calls, logs } = testService();
  const result = await send(USER, { city: 7, email: "new@example.com", rocket_channel: "new-room" });
  assert.equal(result.email.success, true);
  assert.equal(result.rocket.success, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].to, ["new@example.com"]);
  assert.match(calls[0].text, /Тестове повідомлення з порталу[\s\S]*Філія[\s\S]*Місто[\s\S]*admin-test/);
  assert.equal(calls[1].target, "#new-room");
  assert.equal(JSON.stringify(logs).includes("new@example.com"), false);
  assert.equal(JSON.stringify(logs).includes("new-room"), false);
});

test("test channels are independent and raw upstream errors never reach response or audit log", async () => {
  const { send, logs } = testService({ sendEmail: async () => { throw new Error("password=secret SQL /srv/private smtp@example.com"); } });
  const result = await send(USER, { city: 7, email: "a@example.com", rocket_channel: "ops" });
  assert.equal(result.email.success, false);
  assert.equal(result.rocket.success, true);
  assert.doesNotMatch(JSON.stringify({ result, logs }), /secret|SQL|srv\/private|smtp@example/);
});

test("single-channel tests send only that channel", async () => {
  for (const destination of [{ email: "a@example.com" }, { rocket_channel: "ops" }]) {
    const { send, calls } = testService();
    const result = await send(USER, { city: 7, ...destination });
    assert.equal(calls.length, 1);
    assert.equal(destination.email ? result.rocket : result.email, null);
  }
});

test("test validation and authorization reject input before any delivery", async () => {
  const { send, calls } = testService();
  for (const [user, payload, status] of [
    [{ ...USER, role: 5 }, { city: 7, email: "a@example.com" }, 403],
    [USER, { city: 99, email: "a@example.com" }, 403],
    [USER, { city: 7 }, 422], [USER, { city: 7, email: "bad" }, 422],
    [USER, { city: 7, rocket_channel: "#ops/other" }, 422],
    [USER, { city: 7, email: "a@example.com", SMTP_HOST: "attacker" }, 422],
  ]) await assert.rejects(send(user, payload), (error) => error.status === status);
  assert.equal(calls.length, 0);
});

test("test sending has an in-flight lock and cooldown without timers or queue side effects", async () => {
  let release, started, clock = 100;
  const ready = new Promise((resolve) => { started = resolve; });
  const waiting = new Promise((resolve) => { release = resolve; });
  const { send } = testService({ now: () => clock, sendEmail: async () => { started(); await waiting; } });
  const payload = { city: 7, email: "a@example.com" };
  const first = send(USER, payload);
  await ready;
  await assert.rejects(send(USER, payload), (error) => error.status === 429);
  release(); await first;
  await assert.rejects(send(USER, payload), (error) => error.status === 429);
  clock += 30001;
  assert.equal((await send(USER, payload)).email.success, true);
});

test("event identity distinguishes Portal creation, UP creation, and both rejection sources", () => {
  assert.equal(inferTroEvent(null, "NEW"), "TRO_CREATED");
  assert.equal(inferTroEvent("NOT_COMPLETED", "PLANNED"), "TRO_PLANNED");
  assert.equal(inferTroEvent("NEW", "REJECTED"), "TRO_REJECTED");
  assert.equal(inferTroEvent("NOT_COMPLETED", "REJECTED"), "TRO_REJECTED_IN_UP");
  assert.equal(inferTroEvent("PLANNED", "CANCELLED"), null);
});

test("TRO creation delivery logs a text snapshot and preserves the failed original recipient for retry", async () => {
  const logs = [], messages = [];
  const send = createTroNotificationSender({
    getDocument: async () => ({ documentType: "TRO", documentNumber: "ТРО-001", branchId: 2, city: 7, tro: { taName: "ТА" } }),
    loadRecipients: async (city, branch, event) => {
      assert.deepEqual([city, branch, event], [7, 2, { documentType: "TRO", eventCode: "TRO_CREATED" }]);
      return { emails: ["original@example.com"], rocketChannels: ["#ops"] };
    },
    sendEmail: async (...args) => { messages.push(args); throw new Error("SMTP failure"); },
    sendRocket: async () => {}, log: async (entry) => logs.push(entry),
  });
  await assert.rejects(send(USER, 9, null, "NEW", "TRO_CREATED"), /SMTP/);
  assert.equal(logs[0].eventType, "TRO_CREATED");
  assert.equal(logs[0].eventPayload.eventCode, "TRO_CREATED");
  assert.match(logs[0].eventPayload.text, /Створено нову заявку/);
  assert.equal(logs[0].status, "ERROR");
  assert.equal(logs[1].status, "SUCCESS");
  const snapshot = logs[0].eventPayload;
  let pdfCalls = 0;
  const retries = [];
  const retry = createNotificationRetryService({
    ensureAccess: async () => {}, getDocument: async () => ({ documentNumber: "CHANGED", status: "COMPLETED" }),
    db: { async query(sql) {
      return sql.includes("SELECT") ? [[{ id: 1, channel: "EMAIL", event_type: "TRO_CREATED", target: logs[0].target, event_payload: JSON.stringify(snapshot) }]] : [{}];
    } },
    generatePdf: async () => { pdfCalls++; },
    sendStatusEmail: async (...args) => retries.push(args),
  });
  assert.deepEqual(await retry(USER, 9), { retried: 1 });
  assert.equal(pdfCalls, 0);
  assert.deepEqual(retries[0][3], ["original@example.com"]);
  assert.deepEqual(retries[0][4], snapshot);
});

test("legacy retry remains text-only for STATUS_CHANGE and generates PDF only for signed documents", async () => {
  const logs = [
    { id: 1, channel: "EMAIL", target: "old@example.com", event_type: "STATUS_CHANGE", event_payload: JSON.stringify({ oldStatus: "NEW", newStatus: "NOT_COMPLETED" }) },
    { id: 2, channel: "ROCKET", target: "#legacy", event_type: "SIGNED_PDF" },
  ];
  let pdfCount = 0;
  const deliveries = [];
  const retry = createNotificationRetryService({
    db: { async query(sql) { return sql.includes("SELECT") ? [logs] : [{}]; } },
    ensureAccess: async () => {}, getDocument: async () => ({}),
    generatePdf: async () => { pdfCount++; return "PDF"; },
    sendStatusEmail: async (...args) => deliveries.push(args),
    sendPdfRocket: async (...args) => deliveries.push(args),
  });
  assert.equal((await retry(USER, 9)).retried, 2);
  assert.equal(pdfCount, 1);
  assert.deepEqual(deliveries[0].slice(1, 4), ["NEW", "NOT_COMPLETED", ["old@example.com"]]);
  assert.deepEqual(deliveries[1].slice(1), ["#legacy", "PDF"]);
});
