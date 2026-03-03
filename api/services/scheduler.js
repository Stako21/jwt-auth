import cron from "node-cron";
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

setInterval(async () => {
  console.log("Starting SalesAgent import check");
  await runSalesAgents();
}, 2 * 60 * 60 * 1000);

setInterval(async () => {
  console.log("Starting SalesReport import check");
  await runSalesReports();
}, 30 * 1000);

setInterval(async () => {
  console.log("Starting Product import check");
  await runProducts();
}, 2 * 60 * 60 * 1000);

setInterval(async () => {
  console.log("Starting TradePoint import check");
  await runTradePoints();
}, 2 * 60 * 60 * 1000);

cron.schedule("*/5 * * * *", async () => {
  console.log("Starting failed notifications retry");
  await runRetryFailedNotifications();
});
