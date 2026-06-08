import { loadSalesAgents } from "./loadAgents.js";
import { loadSalesReports } from "./loadReports.js";
import { loadOrdersByTimeReport } from "./ordersByTimeReport.service.js";
import { loadBillOfLadingReport } from "./billOfLadingReport.service.js";
import { loadScheduledXlsx1cSalesReports } from "./xlsx1cSalesReport.service.js";
import { loadProducts } from "./loadProducts.js";
import { loadTradePoints } from "./loadTradePoints.js";
import { retryFailedNotifications } from "./notify.retry.service.js";
import { createTaskLogger } from "./taskLogger.js";
import pool from "../db.cjs";
import { getSystemBranch } from "./appConfig.service.js";

const schedulerLogger = createTaskLogger("scheduler");
const validTaskStatuses = new Set([
  "completed",
  "completed_with_warnings",
  "skipped",
  "failed",
]);
const schedulerLastRunColumnNames = [
  "last_run_status",
  "last_run_code",
  "last_run_message",
  "last_run_details",
  "last_run_finished_at",
  "last_run_trigger",
];

let schedulerTaskColumnsCache = null;
let loggedLastRunPersistenceUnavailable = false;
let schedulerStarted = false;

function defaultTaskMessage(taskKey, status) {
  if (status === "completed_with_warnings") {
    return `Task ${taskKey} completed with warnings`;
  }

  if (status === "skipped") {
    return `Task ${taskKey} was skipped`;
  }

  if (status === "failed") {
    return `Task ${taskKey} failed`;
  }

  return `Task ${taskKey} completed`;
}

function normalizeTaskRunResult(taskKey, result) {
  if (!result || typeof result !== "object" || !validTaskStatuses.has(result.status)) {
    return {
      status: "completed",
      code: "task_completed",
      message: defaultTaskMessage(taskKey, "completed"),
      details: {},
    };
  }

  return {
    status: result.status,
    code: typeof result.code === "string" && result.code ? result.code : null,
    message:
      typeof result.message === "string" && result.message.trim()
        ? result.message.trim()
        : defaultTaskMessage(taskKey, result.status),
    details:
      result.details && typeof result.details === "object" && !Array.isArray(result.details)
        ? result.details
        : {},
  };
}

function serializeLastRunDetails(details) {
  try {
    return JSON.stringify(details || {});
  } catch {
    return "{}";
  }
}

function parseLastRunDetails(details) {
  if (!details) return {};

  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toIsoTimestamp(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toSqlDateTime(value) {
  const iso = toIsoTimestamp(value) || new Date().toISOString();
  return iso.slice(0, 19).replace("T", " ");
}

function normalizeStoredLastRun(row) {
  if (!row?.last_run_status || !validTaskStatuses.has(row.last_run_status)) {
    return null;
  }

  return {
    status: row.last_run_status,
    code: row.last_run_code || null,
    message:
      typeof row.last_run_message === "string" && row.last_run_message.trim()
        ? row.last_run_message.trim()
        : defaultTaskMessage(row.task_key, row.last_run_status),
    details: parseLastRunDetails(row.last_run_details),
    finishedAt: toIsoTimestamp(row.last_run_finished_at),
    trigger: row.last_run_trigger || "manual",
  };
}

function hasSchedulerLastRunColumns(columns) {
  return schedulerLastRunColumnNames.every((columnName) => columns.has(columnName));
}

async function getSchedulerTaskColumns() {
  if (schedulerTaskColumnsCache) {
    return schedulerTaskColumnsCache;
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'scheduler_tasks'
      `,
    );

    schedulerTaskColumnsCache = new Set(rows.map((row) => row.COLUMN_NAME));
    return schedulerTaskColumnsCache;
  } catch (error) {
    schedulerLogger.warn("scheduler task columns not loaded from database", {
      errorMessage: error.message,
    });
    schedulerTaskColumnsCache = new Set();
    return schedulerTaskColumnsCache;
  }
}

function logLastRunPersistenceUnavailable() {
  if (loggedLastRunPersistenceUnavailable) {
    return;
  }

  loggedLastRunPersistenceUnavailable = true;
  schedulerLogger.warn("scheduler lastRun persistence is unavailable until migration is applied", {
    table: "scheduler_tasks",
  });
}

function recordTaskRun(task, result, context = {}) {
  task.lastRun = {
    status: result.status,
    code: result.code,
    message: result.message,
    details: result.details,
    finishedAt: new Date().toISOString(),
    trigger: context.trigger || "manual",
  };
}

function serializeTask(task) {
  return {
    key: task.key,
    label: task.label,
    intervalMs: task.intervalMs,
    active: task.active,
    requiresSystemBranch: task.requiresSystemBranch,
    blockedReason: task.blockedReason,
    systemBranch: task.systemBranch,
    lastRun: task.lastRun,
  };
}

function logTaskResult(runLog, taskKey, result, context = {}) {
  const meta = {
    task: taskKey,
    trigger: context.trigger || "manual",
    resultStatus: result.status,
    resultCode: result.code || undefined,
    resultMessage: result.message,
    resultDetails: result.details,
  };

  if (result.status === "failed") {
    runLog.fail(new Error(result.message), "task failed", meta);
    return;
  }

  if (result.status === "completed_with_warnings") {
    runLog.end("task completed with warnings", meta);
    return;
  }

  if (result.status === "skipped") {
    runLog.end("task skipped", meta);
    return;
  }

  runLog.end("task completed", meta);
}

async function persistSchedulerTaskLastRun(task) {
  if (!task.lastRun) {
    return false;
  }

  const columns = await getSchedulerTaskColumns();
  if (!hasSchedulerLastRunColumns(columns)) {
    logLastRunPersistenceUnavailable();
    return false;
  }

  try {
    await pool.query(
      `
      INSERT INTO scheduler_tasks (
        task_key,
        label,
        interval_ms,
        is_active,
        last_run_status,
        last_run_code,
        last_run_message,
        last_run_details,
        last_run_finished_at,
        last_run_trigger
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        interval_ms = VALUES(interval_ms),
        is_active = VALUES(is_active),
        last_run_status = VALUES(last_run_status),
        last_run_code = VALUES(last_run_code),
        last_run_message = VALUES(last_run_message),
        last_run_details = VALUES(last_run_details),
        last_run_finished_at = VALUES(last_run_finished_at),
        last_run_trigger = VALUES(last_run_trigger)
      `,
      [
        task.key,
        task.label,
        task.intervalMs,
        task.active ? 1 : 0,
        task.lastRun.status,
        task.lastRun.code,
        task.lastRun.message,
        serializeLastRunDetails(task.lastRun.details),
        toSqlDateTime(task.lastRun.finishedAt),
        task.lastRun.trigger || "manual",
      ],
    );

    return true;
  } catch (error) {
    schedulerLogger.error("scheduler lastRun not saved to database", {
      task: task.key,
      errorMessage: error.message,
    });
    return false;
  }
}

function withLock(taskDefinition, taskHandler) {
  let isRunning = false;

  return async function runLockedTask(context = {}) {
    if (isRunning) {
      const result = normalizeTaskRunResult(taskDefinition.key, {
        status: "skipped",
        code: "already_running",
        message: `Task ${taskDefinition.key} is already running`,
        details: {
          task: taskDefinition.key,
        },
      });
      schedulerLogger.warn("task skipped: previous run still in progress", {
        task: taskDefinition.key,
        trigger: context.trigger || "manual",
      });
      recordTaskRun(taskDefinition, result, context);
      await persistSchedulerTaskLastRun(taskDefinition);
      return result;
    }

    isRunning = true;
    const runLog = schedulerLogger.start("task started", {
      task: taskDefinition.key,
      trigger: context.trigger || "manual",
    });

    try {
      const rawResult = await taskHandler(context);
      const result = normalizeTaskRunResult(taskDefinition.key, rawResult);
      logTaskResult(runLog, taskDefinition.key, result, context);
      recordTaskRun(taskDefinition, result, context);
      await persistSchedulerTaskLastRun(taskDefinition);
      return result;
    } catch (error) {
      const result = normalizeTaskRunResult(taskDefinition.key, {
        status: "failed",
        code: "unhandled_error",
        message: error?.message || `Task ${taskDefinition.key} failed`,
        details: {
          errorMessage: error?.message,
        },
      });
      runLog.fail(error, "task failed", {
        task: taskDefinition.key,
        trigger: context.trigger || "manual",
      });
      recordTaskRun(taskDefinition, result, context);
      await persistSchedulerTaskLastRun(taskDefinition);
      return result;
    } finally {
      isRunning = false;
    }
  };
}

const schedulerTaskDefinitions = {
  loadSalesAgents: {
    key: "loadSalesAgents",
    label: "Load sales agents",
    intervalMs: 2 * 60 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  loadSalesReports: {
    key: "loadSalesReports",
    label: "Load sales reports",
    intervalMs: 30 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  loadOrdersByTimeReport: {
    key: "loadOrdersByTimeReport",
    label: "Load orders by time report",
    intervalMs: 5 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  loadBillOfLadingReport: {
    key: "loadBillOfLadingReport",
    label: "Load bill of lading report",
    intervalMs: 5 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  loadScheduledXlsx1cSalesReports: {
    key: "loadScheduledXlsx1cSalesReports",
    label: "Load scheduled XLSX 1C sales reports",
    intervalMs: 5 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  loadProducts: {
    key: "loadProducts",
    label: "Load products",
    intervalMs: 2 * 60 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  loadTradePoints: {
    key: "loadTradePoints",
    label: "Load trade points",
    intervalMs: 2 * 60 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: true,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
  retryFailedNotifications: {
    key: "retryFailedNotifications",
    label: "Retry failed notifications",
    intervalMs: 5 * 60 * 1000,
    active: true,
    run: null,
    requiresSystemBranch: false,
    blockedReason: null,
    systemBranch: null,
    lastRun: null,
  },
};

schedulerTaskDefinitions.loadSalesAgents.run = withLock(
  schedulerTaskDefinitions.loadSalesAgents,
  loadSalesAgents,
);
schedulerTaskDefinitions.loadSalesReports.run = withLock(
  schedulerTaskDefinitions.loadSalesReports,
  loadSalesReports,
);
schedulerTaskDefinitions.loadOrdersByTimeReport.run = withLock(
  schedulerTaskDefinitions.loadOrdersByTimeReport,
  loadOrdersByTimeReport,
);
schedulerTaskDefinitions.loadBillOfLadingReport.run = withLock(
  schedulerTaskDefinitions.loadBillOfLadingReport,
  loadBillOfLadingReport,
);
schedulerTaskDefinitions.loadScheduledXlsx1cSalesReports.run = withLock(
  schedulerTaskDefinitions.loadScheduledXlsx1cSalesReports,
  loadScheduledXlsx1cSalesReports,
);
schedulerTaskDefinitions.loadProducts.run = withLock(
  schedulerTaskDefinitions.loadProducts,
  loadProducts,
);
schedulerTaskDefinitions.loadTradePoints.run = withLock(
  schedulerTaskDefinitions.loadTradePoints,
  loadTradePoints,
);
schedulerTaskDefinitions.retryFailedNotifications.run = withLock(
  schedulerTaskDefinitions.retryFailedNotifications,
  retryFailedNotifications,
);

export function getSchedulerTasks() {
  return Object.values(schedulerTaskDefinitions).map(serializeTask);
}

export async function refreshSchedulerTasksState() {
  for (const task of Object.values(schedulerTaskDefinitions)) {
    await refreshTaskBranchRequirement(task);
  }
}

export async function startScheduler() {
  if (schedulerStarted) {
    return getSchedulerTasks();
  }

  await loadSchedulerTaskSettings();
  schedulerStarted = true;

  for (const task of Object.values(schedulerTaskDefinitions)) {
    task.timer = null;
    await restartSchedulerTask(task);
  }

  return getSchedulerTasks();
}

export function stopScheduler() {
  for (const task of Object.values(schedulerTaskDefinitions)) {
    if (task.timer) {
      clearInterval(task.timer);
      task.timer = null;
    }
  }

  schedulerStarted = false;
}

export async function runSchedulerTask(taskKey) {
  const task = schedulerTaskDefinitions[taskKey];
  if (!task) return { found: false };

  const canRun = await refreshTaskBranchRequirement(task);
  if (!canRun) {
    return {
      found: true,
      blockedReason: task.blockedReason,
      task: serializeTask(task),
    };
  }

  const runResult = await task.run({ trigger: "manual" });
  return {
    found: true,
    blockedReason: null,
    task: serializeTask(task),
    runResult,
  };
}

async function loadSchedulerTaskSettings() {
  try {
    const columns = await getSchedulerTaskColumns();
    const lastRunSelect = hasSchedulerLastRunColumns(columns)
      ? `,
         last_run_status,
         last_run_code,
         last_run_message,
         last_run_details,
         last_run_finished_at,
         last_run_trigger`
      : "";

    const [rows] = await pool.query(
      `
      SELECT
        task_key,
        interval_ms,
        is_active${lastRunSelect}
      FROM scheduler_tasks
      `,
    );

    for (const row of rows) {
      const task = schedulerTaskDefinitions[row.task_key];
      if (!task) continue;

      if (Number.isInteger(row.interval_ms) && row.interval_ms > 0) {
        task.intervalMs = row.interval_ms;
      }
      task.active = Boolean(row.is_active);

      if (hasSchedulerLastRunColumns(columns)) {
        task.lastRun = normalizeStoredLastRun(row);
      }
    }
  } catch (error) {
    schedulerLogger.warn("scheduler settings not loaded from database", {
      errorMessage: error.message,
    });
  }
}

async function persistSchedulerTask(task) {
  try {
    await pool.query(
      `
      INSERT INTO scheduler_tasks (task_key, label, interval_ms, is_active)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        label = VALUES(label),
        interval_ms = VALUES(interval_ms),
        is_active = VALUES(is_active)
      `,
      [task.key, task.label, task.intervalMs, task.active ? 1 : 0],
    );
  } catch (error) {
    schedulerLogger.error("scheduler settings not saved to database", {
      task: task.key,
      errorMessage: error.message,
    });
  }
}

async function refreshTaskBranchRequirement(task) {
  if (!task.requiresSystemBranch) {
    task.blockedReason = null;
    task.systemBranch = null;
    return true;
  }

  try {
    const branch = await getSystemBranch();
    task.blockedReason = null;
    task.systemBranch = branch
      ? {
          id: Number(branch.id),
          slug: branch.slug || "",
          name: branch.name || "",
          shortName: branch.shortName || "",
        }
      : null;
    return true;
  } catch (error) {
    task.blockedReason = error.message;
    task.systemBranch = null;
    return false;
  }
}

async function restartSchedulerTask(task) {
  if (task.timer) {
    clearInterval(task.timer);
    task.timer = null;
  }

  if (!schedulerStarted) return;

  if (!task.active) return;

  const canRun = await refreshTaskBranchRequirement(task);
  if (!canRun) {
    schedulerLogger.warn("task is active but not scheduled", {
      task: task.key,
      blockedReason: task.blockedReason,
    });
    return;
  }

  task.timer = setInterval(async () => {
    schedulerLogger.info("interval tick", {
      task: task.key,
      intervalMs: task.intervalMs,
    });
    await task.run({ trigger: "scheduled" });
  }, task.intervalMs);

  schedulerLogger.info("interval scheduled", {
    task: task.key,
    intervalMs: task.intervalMs,
  });
}

export async function updateSchedulerTask(taskKey, options = {}) {
  const task = schedulerTaskDefinitions[taskKey];
  if (!task) return null;

  const { active, intervalMs } = options;
  if (typeof active === "boolean") {
    task.active = active;
  }

  if (Number.isInteger(intervalMs) && intervalMs > 0) {
    task.intervalMs = intervalMs;
  }

  await restartSchedulerTask(task);
  await persistSchedulerTask(task);
  return serializeTask(task);
}
