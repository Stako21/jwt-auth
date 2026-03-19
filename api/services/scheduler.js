import { loadSalesAgents } from "./loadAgents.js";
import { loadSalesReports } from "./loadReports.js";
import { loadProducts } from "./loadProducts.js";
import { loadTradePoints } from "./loadTradePoints.js";
import { retryFailedNotifications } from "./notify.retry.service.js";
import { createTaskLogger } from "./taskLogger.js";

const schedulerLogger = createTaskLogger("scheduler");

function withLock(name, task) {
  let isRunning = false;

  return async function runLockedTask() {
    if (isRunning) {
      schedulerLogger.warn("task skipped: previous run still in progress", {
        task: name,
      });
      return;
    }

    isRunning = true;
    const runLog = schedulerLogger.start("task started", { task: name });
    try {
      await task();
      runLog.end("task completed", { task: name });
    } catch (error) {
      runLog.fail(error, "task failed", { task: name });
    } finally {
      isRunning = false;
    }
  };
}

const runSalesAgents = withLock("loadSalesAgents", loadSalesAgents);
const runSalesReports = withLock("loadSalesReports", loadSalesReports);
const runProducts = withLock("loadProducts", loadProducts);
const runTradePoints = withLock("loadTradePoints", loadTradePoints);
const runRetryFailedNotifications = withLock(
  "retryFailedNotifications",
  retryFailedNotifications,
);

const schedulerTaskDefinitions = {
  loadSalesAgents: {
    key: "loadSalesAgents",
    label: "Load sales agents",
    intervalMs: 2 * 60 * 60 * 1000,
    active: true,
    run: runSalesAgents,
  },
  loadSalesReports: {
    key: "loadSalesReports",
    label: "Load sales reports",
    intervalMs: 30 * 1000,
    active: true,
    run: runSalesReports,
  },
  loadProducts: {
    key: "loadProducts",
    label: "Load products",
    intervalMs: 2 * 60 * 60 * 1000,
    active: true,
    run: runProducts,
  },
  loadTradePoints: {
    key: "loadTradePoints",
    label: "Load trade points",
    intervalMs: 2 * 60 * 60 * 1000,
    active: true,
    run: runTradePoints,
  },
  retryFailedNotifications: {
    key: "retryFailedNotifications",
    label: "Retry failed notifications",
    intervalMs: 5 * 60 * 1000,
    active: true,
    run: runRetryFailedNotifications,
  },
};

export function getSchedulerTasks() {
  return Object.values(schedulerTaskDefinitions).map(
    ({ key, label, intervalMs, active }) => ({
      key,
      label,
      intervalMs,
      active,
    }),
  );
}

export async function runSchedulerTask(taskKey) {
  const task = schedulerTaskDefinitions[taskKey];
  if (!task) return false;
  await task.run();
  return true;
}

function restartSchedulerTask(task) {
  if (task.timer) {
    clearInterval(task.timer);
    task.timer = null;
  }

  if (!task.active) return;

  task.timer = setInterval(async () => {
    schedulerLogger.info("interval tick", {
      task: task.key,
      intervalMs: task.intervalMs,
    });
    await task.run();
  }, task.intervalMs);

  schedulerLogger.info("interval scheduled", {
    task: task.key,
    intervalMs: task.intervalMs,
  });
}

export function updateSchedulerTask(taskKey, options = {}) {
  const task = schedulerTaskDefinitions[taskKey];
  if (!task) return null;

  const { active, intervalMs } = options;
  if (typeof active === "boolean") {
    task.active = active;
  }

  if (Number.isInteger(intervalMs) && intervalMs > 0) {
    task.intervalMs = intervalMs;
  }

  restartSchedulerTask(task);
  return {
    key: task.key,
    label: task.label,
    intervalMs: task.intervalMs,
    active: task.active,
  };
}

Object.values(schedulerTaskDefinitions).forEach((task) => {
  task.timer = null;
  restartSchedulerTask(task);
});
