import { loadSalesAgents } from "./loadAgents.js";
import { loadSalesReports } from "./loadReports.js";
import { loadProducts } from "./loadProducts.js";
import { loadTradePoints } from "./loadTradePoints.js";
import { retryFailedNotifications } from "./notify.retry.service.js";

function withLock(name, task) {
  let isRunning = false;

  return async function runLockedTask() {
    if (isRunning) {
      console.warn(`[scheduler] ${name} skipped: previous run still in progress`);
      return;
    }

    isRunning = true;
    try {
      await task();
    } catch (error) {
      console.error(`[scheduler] ${name} failed:`, error);
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
    console.log(`Starting ${task.key} check`);
    await task.run();
  }, task.intervalMs);
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
